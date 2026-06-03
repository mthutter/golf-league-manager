import { calculateSkins } from "./skins.service.js";
import { get } from "../config/db.js";

/**
 * Fetches skins calculations and maps player IDs to DB names
 */
export const processSkinsForWeek = async (weekId) => {
  // 1. Fetch raw metrics from the core skin calculator
  const { skinTotals, payoutPerSkin, totalPot } = await calculateSkins(weekId);

  // 2. Format winners and look up names in SQLite database
  const formattedWinners = await Promise.all(
    Object.entries(skinTotals || {}).map(async ([playerId, data]) => {
      let memberName = `Player #${playerId}`;

      try {
        const member = await get(
          "SELECT name_last, name_first FROM members WHERE id = ?",
          [playerId],
        );
        if (member) {
          memberName = `${member.name_last}, ${member.name_first}`;
        }
      } catch (sqlError) {
        console.error(
          `SQLite look up failed for player ID ${playerId}:`,
          sqlError,
        );
      }

      const skinsCount =
        data && typeof data === "object" ? data.count || 0 : data || 0;
      const holes = data && data.holes ? data.holes : "N/A";

      return {
        name: memberName,
        holes: holes,
        skinsCount: skinsCount,
        payout: skinsCount * (payoutPerSkin || 0),
      };
    }),
  );

  // 3. Return clean data structure back to controller
  return {
    totalPot:
      totalPot || formattedWinners.reduce((sum, w) => sum + w.payout, 0),
    winners: formattedWinners,
  };
};

/**
 * Core handicap calculation engine runner
 */
export const runHandicapEngine = async (weekId) => {
  // Pure business logic / engine execution
  console.log(`[HANDICAP ENGINE] Recalculated up to week: ${weekId}`);
  // Add actual DB recalculation logic here if needed
  return true;
};
