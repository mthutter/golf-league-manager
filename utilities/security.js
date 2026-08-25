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
 * Assures we evaluate the actual origin client.
 */
const getCleanIp = (req) => {
  // If 'trust proxy' is on, Express populates req.ip with the first link in X-Forwarded-For.
  // Fall back manually to headers if Express 'trust proxy' configuration isn't running yet.
  let rawIp = req.ip;

  if (!rawIp && req.headers["x-forwarded-for"]) {
    const parts = req.headers["x-forwarded-for"].split(",");
    rawIp = parts[0].trim();
  }

  rawIp = rawIp || req.socket.remoteAddress || "";

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
 * Checks if IP matches static whitelists or private LANs.
 * REMOVED CLOUDFLARE_RANGES from here so the real origin visitor IP
 * doesn't get white-flagged by accident if proxy parsing drops out.
 */
const isWhitelisted = (ip) => {
  if (!ip) return false;

  const structuralWhitelist = process.env.SECURITY_IP_WHITELIST ? process.env.SECURITY_IP_WHITELIST.split(",").map((i) => i.trim()) : [];

  if (structuralWhitelist.includes(ip)) return true;
  if (ipRangeCheck(ip, PRIVATE_RANGES)) return true;

  return false;
};

export const corsMiddleware = cors({
  origin: ["http://localhost:8080", "https://bottoms-up-cos.org"],
  credentials: true,
});

export const spamhausCheck = async (req, res, next) => {
  const cleanIp = getCleanIp(req);
  if (!cleanIp || isWhitelisted(cleanIp)) return next();

  if (securityModel.isBanned(cleanIp)) {
    logger.warn(`[SECURITY CACHE BLOCK] Spamhaus dropped pre-banned IP: ${cleanIp} on route: ${req.originalUrl}`);
    return res.status(403).send("Access Denied.");
  }

  if (process.env.NODE_ENV !== "production") return next();
  if (!ipaddr.IPv4.isValid(cleanIp)) return next();

  const reversed = cleanIp.split(".").reverse().join(".");
  try {
    const addresses = await dns.resolve4(`${reversed}.zen.spamhaus.org`);
    const hasMaliciousMatch = addresses.some((address) => {
      const parts = address.split(".");
      if (parts[0] !== "127") return false;
      const lastOctet = parseInt(parts[3], 10);
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

  // Guard check: Reject request immediately if the actual parsed client IP is blocked.
  if (cleanIp && securityModel.isBanned(cleanIp)) {
    logger.warn(`[SECURITY CACHE BLOCK] Firewall dropped pre-banned IP: ${cleanIp} on route: ${req.originalUrl}`);
    return res.status(403).send("Access Denied.");
  }
  // If it's a local/whitelisted path, bypass signature checking
  if (!cleanIp || isWhitelisted(cleanIp)) return next();

  const blockedPaths = ["wlwmanifest.xml", "xmlrpc.php", "wp-admin", "wp-config", "wp-content", ".git"];
  const maliciousSignatures = [".php", ".asp", ".aspx", ".env", "wp-"];
  const lowerPath = req.path.toLowerCase();

  // --- ZERO TOLERANCE CRITICAL SIGNATURE TRAP ---
  const matchesSignature = maliciousSignatures.some((sig) => lowerPath.includes(sig));

  if (matchesSignature) {
    // CRITICAL FIX: Verify we aren't accidentally banning a Cloudflare Proxy node if parsing failed
    if (ipRangeCheck(cleanIp, CLOUDFLARE_RANGES)) {
      logger.error(`[SECURITY WARNING] Block blocked due to proxy leakage. Direct socket connection detected instead of client address: ${cleanIp}`);
      return res.status(404).send("Not Found");
    }

    try {
      await securityModel.manuallyBanIP(cleanIp);
      logger.error(`[SECURITY IMMEDIATE BAN] Critical signature compromise attempt by ${cleanIp} via path: "${req.originalUrl}". IP banned permanently.`);
    } catch (err) {
      logger.error(`[SECURITY] Immediate signature ban insertion failed for ${cleanIp}:`, err);
    }

    if (typeof posthogClient !== "undefined" && posthogClient.capture) {
      posthogClient.capture({
        distinctId: cleanIp,
        event: "bot_attack_blocked",
        properties: {
          $ip: cleanIp,
          requested_path: req.originalUrl,
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
    if (ipRangeCheck(cleanIp, CLOUDFLARE_RANGES)) {
      return res.status(404).send("Not Found");
    }

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
