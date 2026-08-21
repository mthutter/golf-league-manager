// utilities/security.js
import dns from "node:dns/promises";
import { rateLimit } from "express-rate-limit";
import cors from "cors";
import { securityModel } from "../models/security.model.js";
import logger from "./logger.js";
import posthogClient from "./posthog.js";

// Whitelisted origins and structures
const whitelistedIPs = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1", ...(process.env.SECURITY_IP_WHITELIST ? process.env.SECURITY_IP_WHITELIST.split(",") : [])]);

const blockedPaths = ["wlwmanifest.xml", "xmlrpc.php", "wp-admin", "wp-config", "wp-content", ".git"];
const blockedExtensions = [".php", ".asp", ".aspx", ".env"];

/**
 * Normalizes IP output format.
 * Expects Express `trust proxy` to be configured at the root app level.
 */
const getCleanIp = (req) => {
  const rawIp = req.ip || "";
  return rawIp.replace(/^::ffff:/, "").trim();
};

/**
 * Checks if the IP belongs to Cloudflare's 172.64.0.0/13 routing infrastructure
 */
const isCloudflareIP = (ip) => {
  if (!ip || !ip.includes(".")) return false;
  const parts = ip.split(".").map(Number);

  if (parts.length !== 4 || parts.some(isNaN)) return false;

  // Catches Cloudflare proxy blocks between 172.64.x.x and 172.71.x.x
  if (parts[0] === 172 && parts[1] >= 64 && parts[1] <= 71) {
    return true;
  }
  return false;
};

/**
 * Checks for legitimate RFC 1918 internal subnets
 */
const isPrivateIP = (ip) => {
  if (!ip || !ip.includes(".")) return false;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  if (parts[0] === 10) return true; // 10.0.0.0/8
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
  if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
  return false;
};

const isWhitelisted = (ip) => {
  if (!ip) return false;
  // Bypasses checks if explicitly listed, private LAN, or Cloudflare reverse proxy node
  return whitelistedIPs.has(ip) || isPrivateIP(ip) || isCloudflareIP(ip);
};

export const corsMiddleware = cors({
  origin: ["http://localhost:8080", "https://bottoms-up-cos.org"],
  credentials: true,
});

export const spamhausCheck = async (req, res, next) => {
  const cleanIp = getCleanIp(req);
  if (!cleanIp || isWhitelisted(cleanIp)) return next();

  // 1. VISIBILITY LOGGING FOR PRE-BANNED CACHE HITS
  if (await securityModel.isBanned(cleanIp)) {
    logger.warn(`[SECURITY CACHE BLOCK] Spamhaus dropped pre-banned IP: ${cleanIp} on route: ${req.originalUrl}`);
    return res.status(403).send("Access Denied.");
  }

  // 2. BYPASS LOOKUPS IN NON-PROD ENVIRONMENTS
  if (process.env.NODE_ENV !== "production") return next();

  if (!cleanIp.includes(".")) return next();
  const reversed = cleanIp.split(".").reverse().join(".");

  try {
    const addresses = await dns.resolve4(`${reversed}.zen.spamhaus.org`);
    const hasMaliciousMatch = addresses.some((address) => {
      // Ignore ALL variations of public resolver errors / limit codes
      if (address.startsWith("127.255.255")) return false;
      // Ignore Policy Blocklist (PBL: normal residential end-users)
      if (address === "127.0.0.10" || address === "127.0.0.11") return false;
      // Match SBL (127.0.0.2) and XBL/CBL bots/exploits (127.0.0.4-7)
      return true;
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

  // 1. VISIBILITY LOGGING FOR PRE-BANNED CACHE HITS
  if (await securityModel.isBanned(cleanIp)) {
    logger.warn(`[SECURITY CACHE BLOCK] Firewall dropped pre-banned IP: ${cleanIp} on route: ${req.originalUrl}`);
    return res.status(403).send("Access Denied.");
  }

  const lowerPath = req.path.toLowerCase();
  const matchesPath = blockedPaths.some((path) => lowerPath.includes(path));
  const matchesExtension = blockedExtensions.some((ext) => lowerPath.endsWith(ext));

  if (matchesPath || matchesExtension) {
    let strikes = 1;
    try {
      strikes = await securityModel.logSecurityOffenseStrike(cleanIp);
    } catch (err) {
      logger.error(`[SECURITY] Logging strike failed for ${cleanIp}:`, err);
    }

    if (strikes >= 3) {
      logger.error(`[SECURITY] PERMANENT BAN: IP ${cleanIp} reached 3 strikes.`);
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
  skip: (req) => isWhitelisted(getCleanIp(req)),
  keyGenerator: (req) => getCleanIp(req),
  handler: (req, res) => {
    res.status(429).send("Too many requests. Please try again later.");
  },
});
