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
      const rows = await all("SELECT ip FROM permanent_bans");
      rows.forEach((row) => this.permanentBanCache.add(row.ip));
      logger.info(
        `[SECURITY MODEL] Loaded ${this.permanentBanCache.size} permanent IP bans from SQLite.`,
      );
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
      INSERT INTO permanent_bans (ip, strikes, first_seen, last_seen, manual_ban)
      VALUES (?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
      ON CONFLICT(ip) DO UPDATE SET
        strikes = strikes + 1,
        last_seen = CURRENT_TIMESTAMP
    `;
    await run(upsertSql, [ip]);
    const row = await get("SELECT strikes FROM permanent_bans WHERE ip = ?", [
      ip,
    ]);
    const strikes = row ? row.strikes : 1;

    if (strikes >= 3) {
      this.permanentBanCache.add(ip);
      this.transientBanCache.del(ip);
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

    // FIXED: Uses ON CONFLICT to protect first_seen timestamps, and binds the dynamic manual_ban flag
    const sql = `
      INSERT INTO permanent_bans (ip, strikes, first_seen, last_seen, manual_ban)
      VALUES (?, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(ip) DO UPDATE SET
        strikes = 3,
        last_seen = CURRENT_TIMESTAMP,
        manual_ban = ?
    `;

    try {
      await run(sql, [cleanIp, flagValue, flagValue]);

      this.permanentBanCache.add(cleanIp);
      this.transientBanCache.del(cleanIp);

      logger.info(
        `[SECURITY ${isManual ? "MANUAL" : "AUTOMATED"}] IP ${cleanIp} recorded permanently (manual_ban = ${flagValue}).`,
      );
      return true;
    } catch (err) {
      logger.error(
        `[SECURITY ERROR] Failed to record permanent ban execution for ${cleanIp}:`,
        err,
      );
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
