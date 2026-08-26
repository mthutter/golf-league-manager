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
      await run(`
        CREATE TABLE IF NOT EXISTS permanent_bans (
          ip TEXT PRIMARY KEY,
          strikes INTEGER DEFAULT 1,
          first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
          manual_ban INTEGER DEFAULT 0
        );
      `);

      // 🟢 FIX: Cleaned up dual-read rows initialization to run in a single clean pass
      const activeBans = await all("SELECT ip FROM permanent_bans WHERE strikes >= 10 OR manual_ban = 1");
      activeBans.forEach((row) => this.permanentBanCache.add(row.ip));

      logger.info(`[SECURITY MODEL] Loaded ${this.permanentBanCache.size} permanent IP bans from SQLite.`);
    } catch (err) {
      logger.error("[SECURITY MODEL] Initialization failure:", err);
      throw err;
    }
  }

  isBanned(ip) {
    return this.permanentBanCache.has(ip) || this.transientBanCache.has(ip);
  }

  setTransientBan(ip) {
    this.transientBanCache.set(ip, true);
  }

  async logSecurityOffenseStrike(ip) {
    const upsertSql = `
      INSERT INTO permanent_bans (ip, strikes, first_seen, last_seen)
      VALUES (?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(ip) DO UPDATE SET strikes = strikes + 1, last_seen = CURRENT_TIMESTAMP
    `;

    try {
      await run(upsertSql, [ip]);
    } catch (dbError) {
      // 🟢 SAFETIES: Added explicit runtime logging catchers to isolate storage issues instantly
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

  /**
   * Programmatically forces an immediate permanent ban entry into the SQLite engine.
   * @param {string} targetIp - The clean string representation of the IP address.
   * @param {boolean} isManual - True if added via admin tool dashboard, false if triggered by firewall automation.
   */
  async banIP(targetIp, isManual = true) {
    const cleanIp = targetIp.trim();
    const flagValue = isManual ? 1 : 0;

    // 🟢 FIX: Added matching tracking parameters (3 tokens '?' for 3 mapped execution inputs)
    // Avoids using REPLACE INTO directly, which deletes columns and corrupts first_seen dates.
    const sql = `
      INSERT INTO permanent_bans (ip, strikes, first_seen, last_seen, manual_ban)
      VALUES (?, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(ip) DO UPDATE SET 
        strikes = 10,
        last_seen = CURRENT_TIMESTAMP,
        manual_ban = ?
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

  /**
   * Backward-compatible helper link for old dashboard controllers calling the old method name
   */
  async manuallyBanIP(targetIp) {
    return this.banIP(targetIp, true);
  }
}

export const securityModel = new SecurityModel();
