// utilities/security.js
import dns from "node:dns/promises";
import { rateLimit } from "express-rate-limit";
import cors from "cors";
import ipRangeCheck from "ip-range-check"; // Robust subnet validator
import ipaddr from "ipaddr.js";
import { securityModel } from "../models/security.model.js";
import logger from "./logger.js";
import posthogClient from "./posthog.js";

// Comprehensive Cloudflare IPv4 and IPv6 Ranges (Current 2026 Baseline)
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
  "190.93.240.0/20",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

const PRIVATE_RANGES = ["127.0.0.1", "::1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7"];

/**
 * Safely parses and normalizes incoming IPs.
 * Express 'trust proxy' must be configured to extract the true client IP.
 */
const getCleanIp = (req) => {
  const rawIp = req.ip || "";
  if (!rawIp) return "";

  try {
    // Strip IPv4-mapped IPv6 prefixes completely (e.g. ::ffff:127.0.0.1 -> 127.0.0.1)
    if (ipaddr.IPv6.isValid(rawIp)) {
      const addr = ipaddr.IPv6.parse(rawIp);
      if (addr.isIPv4MappedAddress()) {
        return addr.toIPv4Address().toString();
      }
    }
    return rawIp.trim();
  } catch (err) {
    return rawIp.trim();
  }
};

/**
 * Checks if IP matches static whitelists, private LANs, or Cloudflare Edge proxies
 */
const isWhitelisted = (ip) => {
  if (!ip) return false;

  // Resolve dynamic env values safely per evaluation
  const structuralWhitelist = process.env.SECURITY_IP_WHITELIST ? process.env.SECURITY_IP_WHITELIST.split(",").map((i) => i.trim()) : [];

  if (structuralWhitelist.includes(ip)) return true;
  if (ipRangeCheck(ip, PRIVATE_RANGES)) return true;
  if (ipRangeCheck(ip, CLOUDFLARE_RANGES)) return true;

  return false;
};

export const corsMiddleware = cors({
  origin: ["http://localhost:8080", "https://bottoms-up-cos.org"],
  credentials: true,
});

export const spamhausCheck = async (req, res, next) => {
  const cleanIp = getCleanIp(req);
  if (!cleanIp || isWhitelisted(cleanIp)) return next();

  // 1. Structural DB Cache Check
  if (await securityModel.isBanned(cleanIp)) {
    logger.warn(`[SECURITY CACHE BLOCK] Spamhaus dropped pre-banned IP: ${cleanIp} on route: ${req.originalUrl}`);
    return res.status(403).send("Access Denied.");
  }

  if (process.env.NODE_ENV !== "production") return next();
  if (!ipaddr.IPv4.isValid(cleanIp)) return next(); // Spamhaus ZEN focuses on IPv4 translation blocks

  const reversed = cleanIp.split(".").reverse().join(".");
  try {
    const addresses = await dns.resolve4(`${reversed}.zen.spamhaus.org`);

    // Explicitly target clear malicious profiles (SBL, XBL, CBL)
    const hasMaliciousMatch = addresses.some((address) => {
      const parts = address.split(".");
      if (parts[0] !== "127") return false;

      const lastOctet = parseInt(parts[3], 10);
      // 2 = SBL, 3 = CSS, 4-7 = XBL/CBL Botnets/Exploits
      return lastOctet >= 2 && lastOctet <= 7;
    });

    if (hasMaliciousMatch) {
      await securityModel.setTransientBan(cleanIp);
      logger.warn(`[SECURITY] Spamhaus ZEN blocked malicious target: ${cleanIp} (Codes: ${addresses.join(", ")})`);
      return res.status(403).send("Access Denied.");
    }
    return next();
  } catch (err) {
    if (err.code === "ENOTFOUND" || err.code === "ENODATA") return next();
    logger.error("[SECURITY] Spamhaus check error:", err);
    return next();
  }
};

export const firewallMiddleware = async (req, res, next) => {
  const cleanIp = getCleanIp(req);
  if (!cleanIp || isWhitelisted(cleanIp)) return next();

  // 1. FAST DROP: Exit immediately if the IP is already flagged in the DB cache
  if (await securityModel.isBanned(cleanIp)) {
    logger.warn(`[SECURITY CACHE BLOCK] Firewall dropped pre-banned IP: ${cleanIp} on route: ${req.originalUrl}`);
    return res.status(403).send("Access Denied.");
  }

  const blockedPaths = ["wlwmanifest.xml", "xmlrpc.php", "wp-admin", "wp-config", "wp-content", ".git"];

  // Cleaned signatures: Checked as substrings rather than extensions
  const maliciousSignatures = [".php", ".asp", ".aspx", ".env", "wp-"];

  // Normalize lower-case path for robust evaluation
  const lowerPath = req.path.toLowerCase();

  // --- ZERO TOLERANCE CRITICAL SIGNATURE TRAP ---
  // Uses .some() with .includes() to catch parameters and trailing slash workarounds
  const matchesSignature = maliciousSignatures.some((sig) => lowerPath.includes(sig));

  if (matchesSignature) {
    try {
      // ZERO TOLERANCE: Force an unconditioned block on the spot
      // If your model has a permanent ban method, swap this out to lock them out completely.
      await securityModel.setTransientBan(cleanIp);

      logger.error(`[SECURITY IMMEDIATE BAN] Critical signature compromise attempt by ${cleanIp} via path: "${req.originalUrl}". IP banned instantly.`);
    } catch (err) {
      logger.error(`[SECURITY] Immediate signature ban insertion failed for ${cleanIp}:`, err);
    }

    if (typeof posthogClient !== "undefined" && posthogClient.capture) {
      posthogClient.capture({
        distinctId: cleanIp,
        event: "bot_attack_blocked",
        properties: {
          $ip: cleanIp,
          requested_path: req.originalUrl, // Track full URL metadata including query flags
          strike_count: "IMMEDIATE_BAN",
          action_taken: "CRITICAL_SIGNATURE_VIOLATION_LOCKOUT",
        },
      });
    }
    return res.status(404).send("Not Found");
  }

  // --- STANDARD DIRECTORY PATH STRIKE ACCUMULATION ---
  const matchesPath = blockedPaths.some((path) => lowerPath.includes(path));

  if (matchesPath) {
    let strikes = 1;
    try {
      strikes = await securityModel.logSecurityOffenseStrike(cleanIp);
    } catch (err) {
      logger.error(`[SECURITY] Logging strike failed for ${cleanIp}:`, err);
    }

    if (strikes >= 3) {
      logger.error(`[SECURITY] PERMANENT BAN: IP ${cleanIp} reached 3 structural path strikes.`);
    } else {
      await securityModel.setTransientBan(cleanIp);
      logger.warn(`[SECURITY] Path trap: IP ${cleanIp} banned 24h. Strike ${strikes}/3.`);
    }

    if (typeof posthogClient !== "undefined" && posthogClient.capture) {
      posthogClient.capture({
        distinctId: cleanIp,
        event: "bot_attack_blocked",
        properties: {
          $ip: cleanIp,
          requested_path: req.path,
          strike_count: strikes,
          action_taken: strikes >= 3 ? "PERMANENT_MVC_BAN" : "TRANSIENT_24H_BAN",
        },
      });
    }
    return res.status(404).send("Not Found");
  }

  next();
};

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  // Never skip Cloudflare/Proxied loops entirely; rate limit them by client identity!
  skip: (req) => {
    const ip = getCleanIp(req);
    const structuralWhitelist = process.env.SECURITY_IP_WHITELIST ? process.env.SECURITY_IP_WHITELIST.split(",").map((i) => i.trim()) : [];
    return structuralWhitelist.includes(ip) || ipRangeCheck(ip, ["127.0.0.1", "::1"]);
  },
  keyGenerator: (req) => getCleanIp(req),
  handler: (req, res) => {
    res.status(429).send("Too many requests. Please try again later.");
  },
});
