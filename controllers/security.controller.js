// security/security.controller.js
import dns from "node:dns/promises";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import logger from "../utilities/logger.js";
import posthogClient from "../utilities/posthog.js";
import cors from "cors";
import path from "node:path";
import { pathToFileURL } from "node:url";

const blockedPaths = ["wlwmanifest.xml", "xmlrpc.php", "wp-admin", "wp-config", "wp-content", ".git"];
const blockedExtensions = [".php", ".asp", ".aspx", ".env"];

class SecurityController {
  constructor() {
    this.spamhausCheck = this.spamhausCheck.bind(this);
    this.firewallMiddleware = this.firewallMiddleware.bind(this);

    this.corsMiddleware = cors({
      origin: ["http://localhost:8080", "https://bottoms-up-cos.org"],
      credentials: true,
    });

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
        const sourcePort = req.socket?.remotePort || null;
        logger.warn(`[SECURITY] Rate limit exceeded by ${req.ip} on source port ${sourcePort}`);
        res.status(429).send("Too many requests from this client. Please try again later.");
      },
    });
  }

  renderAccessDenied(res) {
    return res.status(403).send("Access Denied.");
  }

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
    const sourcePort = req.socket?.remotePort || null; // 👈 Capture incoming source port

    try {
      const modelAbsoluteDiskPath = path.join(process.cwd(), "models", "security.model.js");
      const modelUrlSpecToken = pathToFileURL(modelAbsoluteDiskPath).href;
      const { securityModel } = await import(modelUrlSpecToken);

      if (securityModel && typeof securityModel.isBanned === "function" && securityModel.isBanned(cleanIp)) {
        return this.renderAccessDenied(res);
      }
    } catch (importErr) {
      logger.error("[SECURITY] Late-binding model allocation failure: " + importErr.message);
    }

    if (!cleanIp.includes(".")) return next();
    const reversed = cleanIp.split(".").reverse().join(".");

    try {
      await dns.resolve4(`${reversed}.zen.spamhaus.org`);

      const modelAbsoluteDiskPath = path.join(process.cwd(), "models", "security.model.js");
      const modelUrlSpecToken = pathToFileURL(modelAbsoluteDiskPath).href;
      const { securityModel } = await import(modelUrlSpecToken);

      if (securityModel && typeof securityModel.setTransientBan === "function") {
        securityModel.setTransientBan(cleanIp, sourcePort); // 👈 Pass port to transient cache
      }

      logger.warn(`[SECURITY] Spamhaus ZEN blocked client: ${cleanIp} on source port: ${sourcePort}`);
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

    const cleanIp = visitorIP.replace(/^::ffff:/, "");
    const sourcePort = req.socket?.remotePort || null; // 👈 Capture incoming source port

    try {
      const modelAbsoluteDiskPath = path.join(process.cwd(), "models", "security.model.js");
      const modelUrlSpecToken = pathToFileURL(modelAbsoluteDiskPath).href;
      const { securityModel } = await import(modelUrlSpecToken);

      if (securityModel && typeof securityModel.isBanned === "function" && securityModel.isBanned(cleanIp)) {
        return this.renderAccessDenied(res);
      }

      const lowerPath = req.path.toLowerCase();
      const matchesPath = blockedPaths.some((path) => lowerPath.includes(path));
      const matchesExtension = blockedExtensions.some((ext) => lowerPath.endsWith(ext));

      if (matchesPath || matchesExtension) {
        let strikes = 1;
        try {
          if (securityModel && typeof securityModel.logSecurityOffenseStrike === "function") {
            strikes = await securityModel.logSecurityOffenseStrike(cleanIp, sourcePort); // 👈 Pass port to SQLite handler
          }
        } catch (err) {
          logger.error(`[SECURITY] Action logging broke for ${cleanIp}:`, err);
        }

        if (strikes >= 10) {
          logger.error(`[SECURITY] PERMANENT BLOCK CONFIGURED: ${cleanIp} reached strike maximum on port ${sourcePort}.`);
        } else {
          logger.warn(`[SECURITY] Permanent accumulation logging added for ${cleanIp} (Port: ${sourcePort}). Strike ${strikes}/10.`);
        }

        if (typeof posthogClient !== "undefined") {
          posthogClient.capture({
            distinctId: cleanIp,
            event: "bot_attack_blocked",
            properties: {
              $ip: cleanIp,
              requested_path: req.path,
              source_port: sourcePort, // 👈 Send port telemetry to PostHog analytics
              strike_count: strikes,
              action_taken: strikes >= 10 ? "PERMANENT_MVC_BAN" : "ACCUMULATING_STRIKE_LOCKOUT",
            },
          });
        }
        return this.renderNotFound(res);
      }
    } catch (globalErr) {
      logger.error("[SECURITY] Middleware exception intercepted: " + globalErr.message);
    }
    next();
  }
}

export const securityController = new SecurityController();
