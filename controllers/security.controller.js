// security/security.controller.js
import dns from "node:dns/promises";
import rateLimit from "express-rate-limit";
import cors from "cors";
import ipRangeCheck from "ip-range-check";
import ipaddr from "ipaddr.js";
import { securityModel } from "../models/security.model.js";
import logger from "../utilities/logger.js";
import posthogClient from "../utilities/posthog.js";

// Comprehensive Cloudflare IPv4 and IPv6 Ranges
const CLOUDFLARE_RANGES = [
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "172.64.0.0/13",
  "173.245.48.0/20",
  "188.114.96.0/20",
  "190.93.240.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.68.0.0/15",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

const PRIVATE_RANGES = ["127.0.0.1", "::1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7"];

const BLOCKED_PATHS = ["wlwmanifest.xml", "xmlrpc.php", "wp-admin", "wp-config", "wp-content", ".git"];

const MALICIOUS_SIGNATURES = [".php", ".asp", ".aspx", ".env", "wp-"];

class SecurityController {
  /**
   * Normalizes an IP string, stripping IPv4-mapped IPv6 prefixes safely.
   */
  #normalizeIp(ip) {
    if (!ip) return "";
    try {
      const trimmed = ip.trim();
      if (ipaddr.IPv6.isValid(trimmed)) {
        const addr = ipaddr.IPv6.parse(trimmed);
        if (addr.isIPv4MappedAddress()) {
          return addr.toIPv4Address().toString();
        }
      }
      return trimmed;
    } catch {
      return ip.trim();
    }
  }

  /**
   * Securely determines the true client origin IP to mitigate routing injection exploits.
   */
  #getCleanIp(req) {
    const directConnection = this.#normalizeIp(req.socket.remoteAddress);
    const isTrustedProxy = ipRangeCheck(directConnection, CLOUDFLARE_RANGES) || ipRangeCheck(directConnection, PRIVATE_RANGES);

    if (isTrustedProxy && req.headers["x-forwarded-for"]) {
      const parts = req.headers["x-forwarded-for"].split(",");
      return this.#normalizeIp(parts[0]);
    }

    return this.#normalizeIp(req.ip) || directConnection;
  }

  /**
   * Validates target against infrastructure whitelists
   */
  #isWhitelisted(ip) {
    if (!ip) return false;
    const structuralWhitelist = process.env.SECURITY_IP_WHITELIST ? process.env.SECURITY_IP_WHITELIST.split(",").map((i) => i.trim()) : [];
    if (structuralWhitelist.includes(ip)) return true;
    return ipRangeCheck(ip, PRIVATE_RANGES);
  }

  // --- PUBLIC INTERFACE VIEW PRESENTERS ---
  renderAccessDenied(res) {
    return res.status(403).send("Access Denied.");
  }

  renderNotFound(res) {
    return res.status(404).send("Not Found");
  }

  // --- CROSS-ORIGIN RESOURCE SHARING ---
  corsMiddleware = cors({
    origin: ["http://localhost:8080", "https://bottoms-up-cos.org"],
    credentials: true,
  });

  // --- MIDDLEWARE LAYERS ---
  spamhausCheck = async (req, res, next) => {
    const clientIp = req.ip;
    if (!clientIp) return next();

    const cleanIp = clientIp.replace(/^::ffff:/, "");

    // Quick early exit using our model's cached lookups
    if (hardcodedBannedIPs.has(cleanIp) || securityModel.isBanned(cleanIp)) {
      return this.renderAccessDenied(res);
    }

    if (process.env.NODE_ENV !== "production") return next();
    if (!ipaddr.IPv4.isValid(cleanIp)) return next();

    const reversed = cleanIp.split(".").reverse().join(".");
    try {
      await dns.resolve4(`${reversed}.zen.spamhaus.org`);

      // Auto-cache to transient memory layer to preserve external DNS query limits
      securityModel.setTransientBan(cleanIp);

      logger.warn(`[SECURITY] Spamhaus ZEN blocked client: ${cleanIp}`);
      return this.renderAccessDenied(res);
    } catch (err) {
      if (err.code === "ENOTFOUND" || err.code === "ENODATA") return next();
      logger.error("[SECURITY] DNSBL validation issue:", err);
      return next();
    }
  };

  // security/security.controller.js
  // ... [Keep the top half of your file exactly as it is now] ...

  firewallMiddleware = async (req, res, next) => {
    const cleanIp = this.#getCleanIp(req);
    const directConnection = this.#normalizeIp(req.socket.remoteAddress);

    if (cleanIp && securityModel.isBanned(cleanIp)) {
      return this.renderAccessDenied(res);
    }

    if (!cleanIp || this.#isWhitelisted(cleanIp)) return next();

    const lowerPath = req.path.toLowerCase();
    const matchesSignature = MALICIOUS_SIGNATURES.some((sig) => lowerPath.includes(sig));
    const matchesPath = BLOCKED_PATHS.some((path) => lowerPath.includes(path));

    if (matchesPath || matchesExtension) {
      let strikes = 1;

      try {
        strikes = await securityModel.logSecurityOffenseStrike(visitorIP);
      } catch (err) {
        logger.error(`[SECURITY] Action logging broke for ${visitorIP}:`, err);
      }

      if (strikes >= 3) {
        logger.error(`[SECURITY] PERMANENT BLOCK CONFIGURED: ${visitorIP} reached strike maximum.`);
      } else {
        securityModel.setTransientBan(visitorIP);
        logger.warn(`[SECURITY] Transient 24h ban added for ${visitorIP}. Strike ${strikes}/3.`);
      }

      if (typeof posthogClient !== "undefined") {
        posthogClient.capture({
          distinctId: visitorIP,
          event: "bot_attack_blocked",
          properties: {
            $ip: visitorIP,
            requested_path: req.path,
            strike_count: strikes,
            action_taken: strikes >= 3 ? "PERMANENT_MVC_BAN" : "TRANSIENT_24H_MVC_BAN",
          },
        });
      }

      return this.renderNotFound(res);
    }

    next();
  };

  // ... [Keep your rateLimiter code as-is below this block] ...

  rateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => this.#isWhitelisted(this.#getCleanIp(req)),
    keyGenerator: (req) => this.#getCleanIp(req),
    handler: (req, res) => {
      res.status(429).send("Too many requests from this client. Please try again later.");
    },
  });
}

export const securityController = new SecurityController();
