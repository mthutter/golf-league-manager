// utilities/unban.js
import { run, get } from "../config/db.js";
import { securityModel } from "./security.model.js";
import logger from "../utilities/logger.js";

/**
 * Administrative utility to safely lift a ban from an IP address.
 * Removes the persistent database record and purges active memory caches.
 *
 * @param {string} targetIp - The exact IP address to unban.
 * @returns {Promise<boolean>} True if successfully unbanned, false otherwise.
 */
export const liftIpBan = async (targetIp) => {
  if (!targetIp) {
    logger.error("[SECURITY ADMIN] Unban failed: No IP address provided.");
    return false;
  }

  const cleanIp = targetIp.trim();

  try {
    // 1. Check if the IP actually exists in the database
    const row = await get("SELECT strikes FROM permanent_bans WHERE ip = ?", [cleanIp]);

    if (!row) {
      logger.info(`[SECURITY ADMIN] IP ${cleanIp} was not found in the persistent database.`);

      // Secondary check: Ensure it's cleared from live RAM caches even if missing from DB
      let cacheCleared = false;
      if (securityModel.permanentBanCache.has(cleanIp)) {
        securityModel.permanentBanCache.delete(cleanIp);
        cacheCleared = true;
      }
      if (securityModel.transientBanCache.has(cleanIp)) {
        securityModel.transientBanCache.del(cleanIp);
        cacheCleared = true;
      }

      if (cacheCleared) {
        logger.info(`[SECURITY ADMIN] Purged unindexed target ${cleanIp} from active RAM caches.`);
      }
      return true;
    }

    // 2. Remove the row from the SQLite tracking tables
    await run("DELETE FROM permanent_bans WHERE ip = ?", [cleanIp]);

    // 3. Evict the IP from memory caches to unlock access instantly
    securityModel.permanentBanCache.delete(cleanIp);
    securityModel.transientBanCache.del(cleanIp);

    logger.info(`[SECURITY ADMIN] SUCCESS: IP ${cleanIp} has been unbanned and all caches have been cleared.`);
    return true;
  } catch (err) {
    logger.error(`[SECURITY ADMIN ERROR] Failed to clear restrictions for ${cleanIp}:`, err);
    return false;
  }
};

// ==========================================
// Optional: Command Line Interface (CLI) Execution
// Run directly via terminal: node utilities/unban.js 8.8.8.8
// ==========================================
const args = process.argv.slice(2);
if (args.length > 0) {
  const inputIp = args[0];

  // Delay slightly to ensure DB connection layers pool correctly depending on architecture setup
  setTimeout(async () => {
    logger.info(`[SECURITY ADMIN] Initializing CLI unban utility for: ${inputIp}...`);
    await liftIpBan(inputIp);
    process.exit(0);
  }, 500);
}
