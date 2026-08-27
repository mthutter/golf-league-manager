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

  // utilities/security.model.js

  // ... (Keep your top imports and constructor exactly the same) ...

  async initialize() {
    try {
      // 🚀 FIXED: Default constraints now store your local mountain time automatically!
      await run(`
        CREATE TABLE IF NOT EXISTS permanent_bans (
          ip TEXT PRIMARY KEY,
          strikes INTEGER DEFAULT 1,
          first_seen DATETIME DEFAULT (datetime('now', 'localtime')),
          last_seen DATETIME DEFAULT (datetime('now', 'localtime')),
          manual_ban INTEGER DEFAULT 0
        );
      `);

      const activeBans = await all("SELECT ip FROM permanent_bans WHERE strikes >= 10 OR manual_ban = 1");
      activeBans.forEach((row) => this.permanentBanCache.add(row.ip));
      logger.info(`[SECURITY MODEL] Loaded ${this.permanentBanCache.size} permanent IP bans from SQLite.`);
    } catch (err) {
      logger.error("[SECURITY MODEL] Initialization failure:", err);
      throw err;
    }
  }

  // ... (Keep isBanned and setTransientBan exactly the same) ...

  async logSecurityOffenseStrike(ip) {
    // 🚀 FIXED: Replaced CURRENT_TIMESTAMP with datetime('now', 'localtime')
    const upsertSql = `
      INSERT INTO permanent_bans (ip, strikes, first_seen, last_seen)
      VALUES (?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
      ON CONFLICT(ip) DO UPDATE SET strikes = strikes + 1, last_seen = datetime('now', 'localtime')
    `;
    try {
      await run(upsertSql, [ip]);
    } catch (dbError) {
      logger.error(`[SQLITE STRIKE FAIL] Upsert transaction broken for IP: ${ip}:`, dbError);
    }

    const row = await get("SELECT strikes FROM permanent_bans WHERE ip = ?", [ip]);
    const strikes = row ? row.strikes : 1;

    if (strikes >= 10) {
      this.permanentBanCache.add(ip);
      this.transientBanCache.del(ip);
      logger.info(`[SECURITY AUTOMATED] IP ${ip} recorded permanently (manual_ban = 0).`);
    }
    return strikes;
  }

  async banIP(targetIp, isManual = true) {
    const cleanIp = targetIp.trim();
    const flagValue = isManual ? 1 : 0;

    // 🚀 FIXED: Replaced CURRENT_TIMESTAMP with datetime('now', 'localtime')
    const sql = `
      INSERT INTO permanent_bans (ip, strikes, first_seen, last_seen, manual_ban)
      VALUES (?, 10, datetime('now', 'localtime'), datetime('now', 'localtime'), ?)
      ON CONFLICT(ip) DO UPDATE SET strikes = 10, last_seen = datetime('now', 'localtime'), manual_ban = ?
    `;
    try {
      await run(sql, [cleanIp, flagValue, flagValue]);
      this.permanentBanCache.add(cleanIp);
      this.transientBanCache.del(cleanIp);
      logger.info(`[SECURITY MANUAL] IP ${cleanIp} successfully added to permanent_bans schema and live cache.`);
      return true;
    } catch (err) {
      logger.error(`[SECURITY ERROR] Failed to manually record ban execution for ${cleanIp}:`, err);
      throw err;
    }
  }

  async manuallyBanIP(targetIp) {
    return this.banIP(targetIp, true);
  }
}

export const securityModel = new SecurityModel();
