// utilities/security.js
import dns from "node:dns/promises";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import cors from "cors";
import { securityModel } from "../models/security.model.js";
import logger from "./logger.js";
import posthogClient from "./posthog.js";

// 1. Single central location for local whitelist controls
const whitelistedIPs = new Set([
  "127.0.0.1", // IPv4 loopback
  "::1", // IPv6 loopback
  "::ffff:127.0.0.1", // IPv4-mapped IPv6 loopback
]);

const isWhitelisted = (ip) => {
  if (!ip) return false;
  return whitelistedIPs.has(ip.trim());
};

const hardcodedBannedIPs = new Set(["192.168.1.100"]);
const blockedPaths = ["wlwmanifest.xml", "xmlrpc.php", "wp-admin", "wp-config", "wp-content", ".git"];
const blockedExtensions = [".php", ".asp", ".aspx", ".env"];

export const corsMiddleware = cors({
  origin: ["http://localhost:8080", "https://bottoms-up-cos.org"],
  credentials: true,
});

export const spamhausCheck = async (req, res, next) => {
  const clientIp = req.ip;
  if (!clientIp) return next();

  // Bypass if local development is whitelisted
  if (isWhitelisted(clientIp)) return next();

  const cleanIp = clientIp.replace(/^::ffff:/, "");
  if (hardcodedBannedIPs.has(cleanIp) || securityModel.isBanned(cleanIp)) {
    return res.status(403).send("Access Denied.");
  }

  if (!cleanIp.includes(".")) return next();
  const reversed = cleanIp.split(".").reverse().join(".");

  try {
    await dns.resolve4(`${reversed}.zen.spamhaus.org`);
    securityModel.setTransientBan(cleanIp);
    logger.warn(`[SECURITY] Spamhaus ZEN blocked target: ${cleanIp}`);
    return res.status(403).send("Access Denied.");
  } catch (err) {
    if (err.code === "ENOTFOUND" || err.code === "ENODATA") return next();
    logger.error("[SECURITY] Spamhaus check error:", err);
    return next();
  }
};

export const firewallMiddleware = async (req, res, next) => {
  const visitorIP = req.ip;
  if (!visitorIP) return next();

  // Bypass if local development is whitelisted
  if (isWhitelisted(visitorIP)) return next();

  if (hardcodedBannedIPs.has(visitorIP) || securityModel.isBanned(visitorIP)) {
    return res.status(403).send("Access Denied.");
  }

  const lowerPath = req.path.toLowerCase();
  const matchesPath = blockedPaths.some((path) => lowerPath.includes(path));
  const matchesExtension = blockedExtensions.some((ext) => lowerPath.endsWith(ext));

  if (matchesPath || matchesExtension) {
    let strikes = 1;
    try {
      strikes = await securityModel.logSecurityOffenseStrike(visitorIP);
    } catch (err) {
      logger.error(`[SECURITY] Logging strike failed for ${visitorIP}:`, err);
    }

    if (strikes >= 3) {
      logger.error(`[SECURITY] PERMANENT BAN: IP ${visitorIP} reached 3 strikes.`);
    } else {
      securityModel.setTransientBan(visitorIP);
      logger.warn(`[SECURITY] Path trap: IP ${visitorIP} banned 24h. Strike ${strikes}/3.`);
    }

    if (typeof posthogClient !== "undefined") {
      posthogClient.capture({
        distinctId: visitorIP,
        event: "bot_attack_blocked",
        properties: {
          $ip: visitorIP,
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

  // Skip rate limiting entirely for your whitelisted IPs
  skip: (req) => isWhitelisted(req.ip),

  keyGenerator: (req) => {
    const rawIp = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    return ipKeyGenerator(rawIp);
  },
  handler: (req, res) => {
    res.status(429).send("Too many requests. Please try again later.");
  },
});
