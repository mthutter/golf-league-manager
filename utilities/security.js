// utils/securityWall.js
import rateLimit from "express-rate-limit";
import NodeCache from "node-cache";
import cors from "cors";
import logger from "./logger.js";

// 1. Initialize self-cleaning ban cache (TTL: 24h, check expired keys every hour)
const banCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });

// 2. Definitive security configurations
const hardcodedBannedIPs = new Set(["192.168.1.100"]);
const blockedPaths = ["wlwmanifest.xml", "xmlrpc.php", "wp-admin", "wp-config", "wp-content", ".git"];
const blockedExtensions = [".php", ".asp", ".aspx", ".env"];

/**
 * Custom firewall middleware to auto-ban scanners and block hardcoded IPs
 */
export const firewallMiddleware = (req, res, next) => {
  const visitorIP = req.ip;
  if (!visitorIP) return next();

  const lowerPath = req.path.toLowerCase();

  // Instant drops for flagged/banned attackers (O(1) lookup)
  const isHardBanned = hardcodedBannedIPs.has(visitorIP);
  const isAutoBanned = banCache.has(visitorIP);

  if (isHardBanned || isAutoBanned) {
    const reason = isHardBanned ? "Hardcoded Ban" : "Auto-Banned Scammer";

    if (typeof logger !== "undefined") {
      logger.warn(`[SECURITY] Request dropped from blocked IP: ${visitorIP} (${reason})`);
    }

    logger.info("Reason: ", reason);
    // Send the specific reason back to the client/browser
    return res.status(403).send(`Access Denied: ${reason}`);
  }

  // 2. Path evaluation
  const matchesPath = blockedPaths.some((path) => lowerPath.includes(path));
  const matchesExtension = blockedExtensions.some((ext) => lowerPath.endsWith(ext));

  if (matchesPath || matchesExtension) {
    banCache.set(visitorIP, true);

    if (typeof logger !== "undefined") {
      logger.error(`[SECURITY] DETECTED MALICIOUS SCAN: IP ${visitorIP} trapped at "${req.path}". IP auto-banned safely for 24 hours.`);
    }

    if (typeof posthogClient !== "undefined") {
      posthogClient.capture({
        distinctId: visitorIP,
        event: "bot_attack_blocked",
        properties: {
          $ip: visitorIP,
          requested_path: req.path,
          block_reason: "Malicious File/Path Scan Trigger",
          user_agent: req.headers["user-agent"],
          action_taken: "IP_Auto_Banned_24h",
        },
      });
    }

    return res.status(404).send("Not Found");
  }

  next();
};

// 3. Network Protection Layer (Rate Limiter Setup)
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true, // Returns RateLimit-* headers
  legacyHeaders: false,

  // Custom handler that overrides the default message
  handler: (req, res, next, options) => {
    // Read the reset time or default to the 15-minute window fallback
    const retryAfterSeconds = res.getHeader("Retry-After") || 15 * 60;

    if (typeof logger !== "undefined") {
      logger.warn(`[RATE LIMIT] IP ${req.ip} exceeded rate limit. Requests blocked.`);
    }

    // Set standard 429 status code
    res.status(429);

    // Provide detailed diagnostics directly to the screen
    res.send(
      `Access Denied: Too Many Requests.\n` +
        `Reason: Your network IP (${req.ip}) exceeded the threshold of ${options.max} requests.\n` +
        `Cooldown: Please try again in ${retryAfterSeconds} seconds.`,
    );
  },
});

// 4. Cross-Origin Resource Sharing Setup
export const corsMiddleware = cors({
  origin: ["http://localhost:8080", "https://bottoms-up-cos.org"],
  credentials: true,
});
