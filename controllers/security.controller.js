// security/security.controller.js
import dns from "node:dns/promises";
import rateLimit from "express-rate-limit";
import { securityModel } from "./security.model.js";
import logger from "../utilities/logger.js";
import posthogClient from "../utilities/posthog.js";

const hardcodedBannedIPs = new Set(["192.168.1.100"]);
const blockedPaths = ["wlwmanifest.xml", "xmlrpc.php", "wp-admin", "wp-config", "wp-content", ".git"];
const blockedExtensions = [".php", ".asp", ".aspx", ".env"];

class SecurityController {
  /**
   * View Presenter Helper for generic access rejection
   */
  renderAccessDenied(res) {
    return res.status(403).send("Access Denied.");
  }

  /**
   * View Presenter Helper for path scanner drops
   */
  renderNotFound(res) {
    return res.status(404).send("Not Found");
  }

  /**
   * Middleware to check target against global DNSBL lists
   */
  spamhausCheck = async (req, res, next) => {
    const clientIp = req.ip;
    if (!clientIp) return next();

    const cleanIp = clientIp.replace(/^::ffff:/, "");

    // Quick early exit using our model's cached lookups
    if (hardcodedBannedIPs.has(cleanIp) || securityModel.isBanned(cleanIp)) {
      return this.renderAccessDenied(res);
    }

    if (!cleanIp.includes(".")) return next(); // Basic IPv4 validation
    const reversed = cleanIp.split(".").reverse().join(".");

    try {
      await dns.resolve4(`${reversed}.zen.spamhaus.org`);

      // Auto-cache to transient memory layer to preserve external DNS query limits
      securityModel.setTransientBan(cleanIp);

      logger.warn(`[SECURITY] Spamhaus ZEN blocked client: ${cleanIp}`);
      return this.renderAccessDenied(res);
    } catch (err) {
      if (err.code === "ENOTFOUND" || err.code === "ENODATA") {
        return next(); // Clean IP
      }
      logger.error("[SECURITY] DNSBL validation issue:", err);
      return next(); // Fail open safely if external networks time out
    }
  };

  /**
   * Middleware to trap and log malicious system path scanners
   */
  firewallMiddleware = async (req, res, next) => {
    const visitorIP = req.ip;
    if (!visitorIP) return next();

    if (hardcodedBannedIPs.has(visitorIP) || securityModel.isBanned(visitorIP)) {
      return this.renderAccessDenied(res);
    }

    const lowerPath = req.path.toLowerCase();
    const matchesPath = blockedPaths.some((path) => lowerPath.includes(path));
    const matchesExtension = blockedExtensions.some((ext) => lowerPath.endsWith(ext));

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

  /**
   * Rate Limit standard compliance layer
   */
  rateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
    handler: (req, res) => {
      res.status(429).send("Too many requests from this client. Please try again later.");
    },
  });
}

export const securityController = new SecurityController();
