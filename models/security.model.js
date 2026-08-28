// utilities/security.model.js
import { run, all, get } from "../config/db.js";
import NodeCache from "node-cache";
import logger from "../utilities/logger.js";

class SecurityModel {
  constructor() {
    this.transientBanCache = new NodeCache({
      stdTTL: 86400,
      checkperiod: 3600,
    });
    this.permanentBanCache = new Set();
  }

  async initialize() {
    try {
      // 🚀 FIXED: Default constraints now store your local mountain time automatically!
      // ➕ ADDED: last_source_port column to store the latest trigger port
      await run(`
        CREATE TABLE IF NOT EXISTS permanent_bans (
          ip TEXT PRIMARY KEY,
          strikes INTEGER DEFAULT 1,
          first_seen DATETIME DEFAULT (datetime('now', 'localtime')),
          last_seen DATETIME DEFAULT (datetime('now', 'localtime')),
          manual_ban INTEGER DEFAULT 0,
          last_source_port INTEGER
        );
      `);

      // SQLite ALTER TABLE execution wrapper to handle backwards compatibility for existing DBs
      try {
        await run("ALTER TABLE permanent_bans ADD COLUMN last_source_port INTEGER;");
        logger.info("[SECURITY MODEL] Database migration: Added last_source_port column to permanent_bans.");
      } catch (alterErr) {
        // Suppress "duplicate column name" error if it already exists from a previous load
        if (!alterErr.message.includes("duplicate column name")) {
          logger.error("[SECURITY MODEL] Structural migration issue:", alterErr);
        }
      }

      const activeBans = await all("SELECT ip FROM permanent_bans WHERE strikes >= 10 OR manual_ban = 1");
      activeBans.forEach((row) => this.permanentBanCache.add(row.ip));
      logger.info(`[SECURITY MODEL] Loaded ${this.permanentBanCache.size} permanent IP bans from SQLite.`);
    } catch (err) {
      logger.error("[SECURITY MODEL] Initialization failure:", err);
      throw err;
    }
  }

  isBanned(ip) {
    if (this.permanentBanCache.has(ip)) return true;
    if (this.transientBanCache.has(ip)) return true;
    return false;
  }

  setTransientBan(ip, sourcePort = null) {
    // Stores the IP in cache memory. Source port is logged via log tags or can be included here
    this.transientBanCache.set(ip, { bannedAt: new Date(), sourcePort });
  }

  async logSecurityOffenseStrike(ip, sourcePort = null) {
    // 🚀 FIXED: Replaced CURRENT_TIMESTAMP with datetime('now', 'localtime')
    // ➕ ADDED: last_source_port tracks the client port that triggered this specific strike iteration
    const upsertSql = `
      INSERT INTO permanent_bans (ip, strikes, first_seen, last_seen, last_source_port)
      VALUES (?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'), ?)
      ON CONFLICT(ip) DO UPDATE SET 
        strikes = strikes + 1, 
        last_seen = datetime('now', 'localtime'),
        last_source_port = ?
    `;

    try {
      // Pass sourcePort twice to satisfy both the INSERT declaration and the DO UPDATE assignments
      await run(upsertSql, [ip, sourcePort, sourcePort]);
    } catch (dbError) {
      logger.error(`[SQLITE STRIKE FAIL] Upsert transaction broken for IP: ${ip}:`, dbError);
    }

    const row = await get("SELECT strikes FROM permanent_bans WHERE ip = ?", [ip]);
    const strikes = row ? row.strikes : 1;

    if (strikes >= 10) {
      this.permanentBanCache.add(ip);
      this.transientBanCache.del(ip);
      logger.info(`[SECURITY AUTOMATED] IP ${ip} recorded permanently (manual_ban = 0) from port ${sourcePort}.`);
    }
    return strikes;
  }

  async banIP(targetIp, isManual = true, sourcePort = null) {
    const cleanIp = targetIp.trim();
    const flagValue = isManual ? 1 : 0;

    // 🚀 FIXED: Replaced CURRENT_TIMESTAMP with datetime('now', 'localtime')
    // ➕ ADDED: explicit last_source_port ingestion mapping bindings
    const sql = `
      INSERT INTO permanent_bans (ip, strikes, first_seen, last_seen, manual_ban, last_source_port)
      VALUES (?, 10, datetime('now', 'localtime'), datetime('now', 'localtime'), ?, ?)
      ON CONFLICT(ip) DO UPDATE SET 
        strikes = 10, 
        last_seen = datetime('now', 'localtime'), 
        manual_ban = ?,
        last_source_port = ?
    `;

    try {
      await run(sql, [cleanIp, flagValue, sourcePort, flagValue, sourcePort]);
      this.permanentBanCache.add(cleanIp);
      this.transientBanCache.del(cleanIp);
      logger.info(`[SECURITY MANUAL] IP ${cleanIp} (Port: ${sourcePort}) successfully added to permanent_bans schema and live cache.`);
      return true;
    } catch (err) {
      logger.error(`[SECURITY ERROR] Failed to manually record ban execution for ${cleanIp}:`, err);
      throw err;
    }
  }

  async manuallyBanIP(targetIp) {
    // If manually banning from an admin console, no network socket is bound, default port parameter remains null
    return this.banIP(targetIp, true, null);
  }
}

export const securityModel = new SecurityModel();
