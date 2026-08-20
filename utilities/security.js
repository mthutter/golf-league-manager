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

const isWhitelisted = (ip) => {
  if (!ip) return false;
  return whitelistedIPs.has(ip);
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

  // Prevent DNS infrastructure crashes: Avoid path lookups for IPv6
  if (!cleanIp.includes(".")) return next();
  const reversed = cleanIp.split(".").reverse().join(".");

  try {
    // Note: Ensure your server environment uses a registered query key if using public DNS
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
