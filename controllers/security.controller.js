// security/security.controller.js
import dns from "node:dns/promises";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { securityModel } from "../models/security.model.js";
import logger from "../utilities/logger.js";
import posthogClient from "../utilities/posthog.js";
import cors from "cors";

const blockedPaths = ["wlwmanifest.xml", "xmlrpc.php", "wp-admin", "wp-config", "wp-content", ".git"];
const blockedExtensions = [".php", ".asp", ".aspx", ".env"];

class SecurityController {
  constructor() {
    // 🔴 CRITICAL FIX: Explicitly bind the context execution layer
    // This stops Express from losing track of "this" when running route stacks
    this.spamhausCheck = this.spamhausCheck.bind(this);
    this.firewallMiddleware = this.firewallMiddleware.bind(this);

    this.corsMiddleware = cors({
      origin: ["http://localhost:8080", "https://bottoms-up-cos.org"],
      credentials: true,
    });

    // Compile the rate limiter directly to an active instance property
    this.rateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
        return ipKeyGenerator(ip);
      },
      validate: {
        keyGeneratorIpFallback: false,
        ip: false,
        trustProxy: false,
      },
      handler: (req, res) => {
        res.status(429).send("Too many requests from this client. Please try again later.");
      },
    });
  }

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
  async spamhausCheck(req, res, next) {
    const clientIp = req.ip;
    if (!clientIp) return next();
    const cleanIp = clientIp.replace(/^::ffff:/, "");

    if (securityModel.isBanned(cleanIp)) {
      return this.renderAccessDenied(res);
    }

    if (!cleanIp.includes(".")) return next();
    const reversed = cleanIp.split(".").reverse().join(".");

    try {
      await dns.resolve4(`${reversed}.zen.spamhaus.org`);
      securityModel.setTransientBan(cleanIp);
      logger.warn(`[SECURITY] Spamhaus ZEN blocked client: ${cleanIp}`);
      return this.renderAccessDenied(res);
    } catch (err) {
      if (err.code === "ENOTFOUND" || err.code === "ENODATA") {
        return next();
      }
      logger.error("[SECURITY] DNSBL validation issue:", err);
      return next();
    }
  }

  /**
   * Middleware to trap and log malicious system path scanners
   */
  async firewallMiddleware(req, res, next) {
    const visitorIP = req.ip;
    if (!visitorIP) return next();

    if (securityModel.isBanned(visitorIP)) {
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

      if (strikes >= 10) {
        logger.error(`[SECURITY] PERMANENT BLOCK CONFIGURED: ${visitorIP} reached strike maximum.`);
      } else {
        logger.warn(`[SECURITY] Permanent accumulation logging added for ${visitorIP}. Strike ${strikes}/10.`);
      }

      if (typeof posthogClient !== "undefined") {
        posthogClient.capture({
          distinctId: visitorIP,
          event: "bot_attack_blocked",
          properties: {
            $ip: visitorIP,
            requested_path: req.path,
            strike_count: strikes,
            action_taken: strikes >= 10 ? "PERMANENT_MVC_BAN" : "ACCUMULATING_STRIKE_LOCKOUT",
          },
        });
      }
      return this.renderNotFound(res);
    }

    next();
  }
}

export const securityController = new SecurityController();
