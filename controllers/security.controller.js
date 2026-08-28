// security/security.controller.js
import dns from "node:dns/promises";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import logger from "../utilities/logger.js";
import posthogClient from "../utilities/posthog.js";
import cors from "cors";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { all, run } from "../config/db.js"; // ➕ ADDED: Native raw database connection driver imports

const blockedPaths = ["wlwmanifest.xml", "xmlrpc.php", "wp-admin", "wp-config", "wp-content", ".git"];
const blockedExtensions = [".php", ".asp", ".aspx", ".env"];

class SecurityController {
  constructor() {
    this.spamhausCheck = this.spamhausCheck.bind(this);
    this.firewallMiddleware = this.firewallMiddleware.bind(this);
    this.getBlacklist = this.getBlacklist.bind(this); // ➕ ADDED
    this.addManualBan = this.addManualBan.bind(this); // ➕ ADDED
    this.liftBan = this.liftBan.bind(this); // ➕ ADDED

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
   * Helper to retrieve the current security model via late binding
   */
  async _getSecurityModel() {
    const modelAbsoluteDiskPath = path.join(process.cwd(), "models", "security.model.js");
    const modelUrlSpecToken = pathToFileURL(modelAbsoluteDiskPath).href;
    const { securityModel } = await import(modelUrlSpecToken);
    return securityModel;
  }

  /**
   * ➕ ADDED: GET /admin/security/blacklist
   * Renders the administrative active blacklist panel layout template context
   */
  /**
   * GET /admin/security/blacklist
   * Renders the administrative active blacklist panel layout template context
   */
  async getBlacklist(req, res) {
    try {
      // 🚀 FIXED: Unified column extraction matches your exact table configuration
      const query = `
                SELECT 
                    ip, 
                    strikes, 
                    COALESCE(last_source_port, trigger_source_port) AS last_source_port, 
                    first_seen, 
                    last_seen, 
                    manual_ban 
                FROM permanent_bans 
                ORDER BY last_seen DESC
            `;
      const bannedIps = await all(query);

      console.log("Banned IPs from table: ", bannedIps);

      // 🚀 FIXED: Render targets your nested path.
      // Removed redundant 'success' and 'error' objects since app.js supplies them globally!
      return res.render("blacklist", {
        bannedIps,
      });
    } catch (err) {
      logger.error("[SECURITY CONTROLLER] Failed to retrieve blacklist table rows:", err);
      return res.status(500).send("Internal Server Error processing security dashboard roster.");
    }
  }

  /**
   * ➕ ADDED: POST /admin/security/blacklist/add
   * Manually inserts an IP target override boundary directly into security operations
   */
  async addManualBan(req, res) {
    const { ip } = req.body;
    if (!ip || ip.trim() === "") {
      if (req.flash) req.flash("error", "A valid target IP address parameter must be supplied.");
      return res.redirect("/admin/security/blacklist");
    }

    try {
      const securityModel = await this._getSecurityModel();
      await securityModel.manuallyBanIP(ip);
      if (req.flash) req.flash("success", `Successfully issued manual ban parameter restrictions onto node: ${ip}`);
    } catch (err) {
      logger.error(`[SECURITY CONTROLLER] Manual execution ban allocation failed for ${ip}:`, err);
      if (req.flash) req.flash("error", "Database execution error configuring manual restriction matrix.");
    }
    return res.redirect("/admin/security/blacklist");
  }
  /**
   * ➕ ADDED: POST /admin/security/blacklist/delete
   * Purges database records and drops hot runtime memory cache restrictions
   */
  async liftBan(req, res) {
    const { ip } = req.body;
    if (!ip) {
      if (req.flash) req.flash("error", "Target parameter node verification failed.");
      return res.redirect("/admin/security/blacklist");
    }

    try {
      const cleanIp = ip.trim();
      await run("DELETE FROM permanent_bans WHERE ip = ?", [cleanIp]);

      const securityModel = await this._getSecurityModel();
      if (securityModel) {
        securityModel.permanentBanCache.delete(cleanIp);
        securityModel.transientBanCache.del(cleanIp);
      }

      logger.info(`[SECURITY MANUAL DELETION] Authorized access clearance granted back to IP node: ${cleanIp}`);
      if (req.flash) req.flash("success", `Access rules restored. Successfully lifted restrictions for IP: ${cleanIp}`);
    } catch (err) {
      logger.error(`[SECURITY CONTROLLER] Restoration execution breakdown for ${ip}:`, err);
      if (req.flash) req.flash("error", "System failed to drop database firewall definitions.");
    }
    return res.redirect("/admin/security/blacklist");
  }

  /**
   * Middleware to check target against global DNSBL lists
   */
  async spamhausCheck(req, res, next) {
    const clientIp = req.ip;
    if (!clientIp) return next();
    const cleanIp = clientIp.replace(/^::ffff:/, "");
    const sourcePort = req.socket?.remotePort || null;

    try {
      const securityModel = await this._getSecurityModel();
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
      const securityModel = await this._getSecurityModel();
      if (securityModel && typeof securityModel.setTransientBan === "function") {
        securityModel.setTransientBan(cleanIp, sourcePort);
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
    const sourcePort = req.socket?.remotePort || null;

    try {
      const securityModel = await this._getSecurityModel();
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
            strikes = await securityModel.logSecurityOffenseStrike(cleanIp, sourcePort);
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
              source_port: sourcePort,
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
