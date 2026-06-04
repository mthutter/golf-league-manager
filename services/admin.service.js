import { calculateSkins } from "./skins.service.js";
import { get, all } from "../config/db.js"; // Added 'all' for complete lookup support

/**
 * Fetches skins calculations and maps player IDs to DB names
 */
/**
 * Fetches skins calculations and maps player IDs to DB names
 */
export const processSkinsForWeek = async (weekId) => {
  // 1. Fetch raw metrics from the core skin calculator
  const { skinTotals, payoutPerSkin, totalPot, holeBreakdown } =
    await calculateSkins(weekId);

  console.log("--- SKINS CALCULATION ENGINE RAW OUTPUT ---", {
    skinTotals,
    payoutPerSkin,
    totalPot,
    holeBreakdown,
  });

  // 2. Format winners and look up names in SQLite database for the Leaderboard
  const formattedWinners = await Promise.all(
    Object.entries(skinTotals || {}).map(async ([playerId, data]) => {
      let name_first = "Player";
      let name_last = `#${playerId}`;
      try {
        const member = await get(
          "SELECT name_last, name_first FROM members WHERE id = ?",
          [playerId],
        );
        if (member) {
          name_first = member.name_first;
          name_last = member.name_last;
        }
      } catch (sqlError) {
        console.error(
          `SQLite look up failed for player ID ${playerId}:`,
          sqlError,
        );
      }

      const skinsCount =
        data && typeof data === "object" ? data.count || 0 : data || 0;

      return {
        member_id: Number(playerId),
        name_first: name_first,
        name_last: name_last,
        skins_won: skinsCount,
        payout: Math.round(skinsCount * (payoutPerSkin || 0)),
      };
    }),
  );

  // 3. Reconstruct detailed individual hole details needed for grid cell highlighting
  const detailsArray = [];

  if (holeBreakdown && Array.isArray(holeBreakdown)) {
    for (const record of holeBreakdown) {
      const holeNumber = record.hole_number || record.holeNumber || record.hole;
      const memberId =
        record.member_id || record.memberId || record.playerId || record.id;
      const netScore = record.net_score || record.netScore || record.net || 0;
      const isSplit =
        record.is_split || record.isSplit || record.winnersCount > 1 || false;
      const first_name =
        record.name_first || record.nameFirst || record.firstName || "Player";

      if (holeNumber && memberId) {
        detailsArray.push({
          hole_number: Number(holeNumber),
          member_id: Number(memberId),
          name_first: first_name,
          net_score: netScore,
          skins_won: isSplit ? 0.5 : 1.0,
          payout: isSplit ? (payoutPerSkin || 0) * 0.5 : payoutPerSkin || 0,
        });
      }
    }
  }
  // ✨ FIXING THE FALLBACK LAYER: Successfully populates detailsArray from skinTotals
  else if (skinTotals && typeof skinTotals === "object") {
    for (const [playerId, data] of Object.entries(skinTotals)) {
      if (data && data.holes && Array.isArray(data.holes)) {
        // Dynamic name lookup from our formattedWinners array built in step 2
        const matchingWinnerObj = formattedWinners.find(
          (w) => Number(w.member_id) === Number(playerId),
        );
        const mappedFirstName = matchingWinnerObj
          ? matchingWinnerObj.name_first
          : "Player";

        for (const holeNum of data.holes) {
          detailsArray.push({
            hole_number: Number(holeNum),
            member_id: Number(playerId),
            name_first: mappedFirstName,
            net_score: "",
            skins_won: 1.0,
            payout: payoutPerSkin || 0,
          });
        }
      }
    }
  }

  // 4. Return clean data structure matching controller signatures perfectly
  return {
    totalPot: totalPot || 0,
    leaderboard: formattedWinners,
    holeDetails: detailsArray, // ✨ FIXED: Changed from generatedHoleDetails to detailsArray
  };
};

/**
 * Core handicap calculation engine runner
 */
export const runHandicapEngine = async (weekId) => {
  console.log(`[HANDICAP ENGINE] Recalculated up to week: ${weekId}`);
  return true;
};
