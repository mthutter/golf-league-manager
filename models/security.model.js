// utilities/security.model.js
import { run, all, get } from "../config/db.js"; // Tailor path to your db.js location
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
      const rows = await all("SELECT ip FROM permanent_bans");
      // Only cache them if they actually crossed the 10-strike threshold or were manually banned
      // This prevents a low-level transient scanner from sticking in your persistent RAM state upon server reboot
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
    await run(upsertSql, [ip]);

    const row = await get("SELECT strikes FROM permanent_bans WHERE ip = ?", [ip]);
    const strikes = row ? row.strikes : 1;

    // 🔴 REFACTORED: Threshold bumped from 3 to 10 strikes
    if (strikes >= 10) {
      this.permanentBanCache.add(ip);
      this.transientBanCache.del(ip);

      // Found it! This matches your Render output perfectly when automation locks down an attacker.
      logger.info(`[SECURITY AUTOMATED] IP ${ip} recorded permanently (manual_ban = 0).`);
    }

    return strikes;
  }

  /**
   * Programmatically forces an absolute permanent ban entry into the SQLite tracking engine.
   * @param {string} targetIp - The clean string representation of the bad actor's IP address.
   */
  async manuallyBanIP(targetIp) {
    const cleanIp = targetIp.trim();
    const sql = `
      REPLACE INTO permanent_bans (ip, strikes, first_seen, last_seen, manual_ban)
      VALUES (?, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1);
    `; // 🔴 REFACTORED: Sets default strike tracking to 10 for manual inputs

    try {
      // 1. Write the row straight to SQLite using your run query module
      await run(sql, [cleanIp]);

      // 2. Inject it into the live RAM cache so it blocks instantly without a server reboot
      this.permanentBanCache.add(cleanIp);
      this.transientBanCache.del(cleanIp);

      logger.info(`[SECURITY MANUAL] IP ${cleanIp} successfully added to permanent_bans schema and live cache.`);
      return true;
    } catch (err) {
      logger.error(`[SECURITY ERROR] Failed to manually record ban execution for ${cleanIp}:`, err);
      throw err;
    }
  }
}

export const securityModel = new SecurityModel();
