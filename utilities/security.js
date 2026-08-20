// utilities/security.js
import dns from "node:dns/promises";
import { rateLimit } from "express-rate-limit";
import cors from "cors";
import { securityModel } from "../models/security.model.js";
import logger from "./logger.js";
import posthogClient from "./posthog.js";

const whitelistedIPs = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

const hardcodedBannedIPs = new Set(["192.168.1.100"]);
const blockedPaths = ["wlwmanifest.xml", "xmlrpc.php", "wp-admin", "wp-config", "wp-content", ".git"];
const blockedExtensions = [".php", ".asp", ".aspx", ".env"];

// Helper to ensure consistent IP formatting across all middleware
const getCleanIp = (req) => {
  const rawIp = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
  return rawIp.replace(/^::ffff:/, "").trim();
};

// Helper to accurately bypass internal private infrastructure networks
const isPrivateIP = (ip) => {
  if (!ip || !ip.includes(".")) return false;

  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;

  // 10.0.0.0/8
  if (parts[0] === 10) return true;

  // 172.16.0.0/12 (Internal Docker networks, Kubernetes pods, AWS VPC components)
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;

  return false;
};

const isWhitelisted = (ip) => {
  if (!ip) return false;
  return whitelistedIPs.has(ip) || isPrivateIP(ip);
};

export const corsMiddleware = cors({
  origin: ["http://localhost:8080", "https://bottoms-up-cos.org"],
  credentials: true,
});

export const spamhausCheck = async (req, res, next) => {
  const cleanIp = getCleanIp(req);
  if (!cleanIp || isWhitelisted(cleanIp)) return next();

  if (hardcodedBannedIPs.has(cleanIp) || securityModel.isBanned(cleanIp)) {
    return res.status(403).send("Access Denied.");
  }

  if (!cleanIp.includes(".")) return next();
  const reversed = cleanIp.split(".").reverse().join(".");

  try {
    const addresses = await dns.resolve4(`${reversed}.zen.spamhaus.org`);

    // Check if any returned code represents a genuine malicious threat
    const hasMaliciousMatch = addresses.some((address) => {
      // 1. Ignore public resolver/limit errors (returns true to skip blocking)
      if (address.startsWith("127.255.255.")) return false;

      // 2. Ignore Policy Blocklist (PBL: 127.0.0.10, 127.0.0.11)
      // These are normal residential/mobile IPs visiting your web app.
      if (address === "127.0.0.10" || address === "127.0.0.11") return false;

      // 3. Block true malicious sources:
      // 127.0.0.2 (SBL - Known spammers/abusers)
      // 127.0.0.4 - 127.0.0.7 (XBL/CBL - Infected bots, malware, exploits)
      return true;
    });

    if (hasMaliciousMatch) {
      securityModel.setTransientBan(cleanIp);
      logger.warn(`[SECURITY] Spamhaus ZEN blocked malicious target: ${cleanIp} (Codes: ${addresses.join(", ")})`);
      return res.status(403).send("Access Denied.");
    }

    return next();
  } catch (err) {
    // ENOTFOUND or ENODATA means the IP is perfectly clean
    if (err.code === "ENOTFOUND" || err.code === "ENODATA") return next();
    logger.error("[SECURITY] Spamhaus check error:", err);
    return next();
  }
};

export const firewallMiddleware = async (req, res, next) => {
  const cleanIp = getCleanIp(req);
  if (!cleanIp || isWhitelisted(cleanIp)) return next();

  if (hardcodedBannedIPs.has(cleanIp) || securityModel.isBanned(cleanIp)) {
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
      securityModel.setTransientBan(cleanIp);
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
