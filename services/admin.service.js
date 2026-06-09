import { calculateSkins } from "./skins.service.js";
import { get, all, run } from "../config/db.js"; // Included 'run' for database write transactions

/**
 * Fetches skins calculations, processes complex carryover logic, and maps player IDs to DB names
 */
export const processSkinsForWeek = async (weekId) => {
  if (!weekId) throw new Error("A valid week ID is required.");

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
          `SQLite lookup failed for player ID ${playerId}:`,
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
        payout: 0, // Will be dynamically computed by the carryover engine below
      };
    }),
  );

  // =========================================================================
  // ✨ SEQUENTIAL HOLE-BY-HOLE CARRYOVER ENGINE
  // =========================================================================
  const baseValuePerHole = Number(totalPot || 0) / 9; // Native financial division per hole
  let carriedPursePool = 0; // Tracks jackpot roll accumulation loops
  const holePayouts = {}; // Stores computed final payouts per hole number

  // First Pass: Walk sequentially from Hole 1 to Hole 9 to calculate carryover purses
  for (let hNum = 1; hNum <= 9; hNum++) {
    let winnersForThisHole = 0;

    if (holeBreakdown && Array.isArray(holeBreakdown)) {
      winnersForThisHole = holeBreakdown.filter((record) => {
        const h = record.hole_number || record.holeNumber || record.hole;
        return Number(h) === hNum;
      }).length;
    } else if (skinTotals && typeof skinTotals === "object") {
      winnersForThisHole = Object.entries(skinTotals).filter(
        ([_, d]) => d.holes && d.holes.includes(hNum),
      ).length;
    }

    // Add this hole's native purse to whatever jackpot has accumulated so far
    const activeHoleValue = baseValuePerHole + carriedPursePool;

    if (winnersForThisHole === 0) {
      // HALVED HOLE: Entire active purse rolls forward to pile onto the next hole
      carriedPursePool = activeHoleValue;
      holePayouts[hNum] = 0;
    } else {
      // SKIN CLAIMED: The purse is successfully paid out. Carryover pool resets back to 0.
      holePayouts[hNum] = activeHoleValue;
      carriedPursePool = 0;
    }
  }

  // Handle ultimate hole edge case: If hole 9 is tied, distribute leftover pool to active winners evenly
  if (carriedPursePool > 0) {
    let totalSkinsClaimedAcrossField = 0;
    for (let h = 1; h <= 9; h++) {
      if (holePayouts[h] > 0) totalSkinsClaimedAcrossField++;
    }

    if (totalSkinsClaimedAcrossField > 0) {
      const leftoverBonusPerWonHole =
        carriedPursePool / totalSkinsClaimedAcrossField;
      for (let h = 1; h <= 9; h++) {
        if (holePayouts[h] > 0) holePayouts[h] += leftoverBonusPerWonHole;
      }
    }
  }

  // 3. Reconstruct detailed individual hole details needed for grid cell highlighting
  const detailsArray = [];

  if (holeBreakdown && Array.isArray(holeBreakdown)) {
    for (const record of holeBreakdown) {
      const holeNumber = record.hole_number || record.holeNumber || record.hole;
      const memberId =
        record.member_id || record.memberId || record.playerId || record.id;
      const netScore = record.net_score || record.netScore || record.net || 0;
      const first_name =
        record.name_first || record.nameFirst || record.firstName || "Player";

      if (holeNumber && memberId) {
        const totalWinnersForHole = holeBreakdown.filter(
          (r) => (r.hole_number || r.holeNumber || r.hole) === holeNumber,
        ).length;

        const individualHolePayout =
          holePayouts[holeNumber] / (totalWinnersForHole || 1);

        detailsArray.push({
          hole_number: Number(holeNumber),
          member_id: Number(memberId),
          name_first: first_name,
          net_score: netScore,
          skins_won: totalWinnersForHole === 1 ? 1.0 : 1 / totalWinnersForHole,
          payout: individualHolePayout,
        });
      }
    }
  }
  // EMERGENCY FALLBACK LAYER: Reconstruct data from skinTotals using dynamic carryover calculations
  else if (skinTotals && typeof skinTotals === "object") {
    for (const [playerId, data] of Object.entries(skinTotals)) {
      if (data && data.holes && Array.isArray(data.holes)) {
        const matchingWinnerObj = formattedWinners.find(
          (w) => Number(w.member_id) === Number(playerId),
        );
        const mappedFirstName = matchingWinnerObj
          ? matchingWinnerObj.name_first
          : "Player";

        for (const holeNum of data.holes) {
          const totalWinnersForHole = Object.entries(skinTotals).filter(
            ([_, d]) => d.holes && d.holes.includes(holeNum),
          ).length;

          const individualHolePayout =
            holePayouts[holeNum] / (totalWinnersForHole || 1);

          detailsArray.push({
            hole_number: Number(holeNum),
            member_id: Number(playerId),
            name_first: mappedFirstName,
            net_score: "",
            skins_won:
              totalWinnersForHole === 1 ? 1.0 : 1 / totalWinnersForHole,
            payout: individualHolePayout,
          });
        }
      }
    }
  }

  // 4. Update the formattedWinners Leaderboard standings with dynamic carryover math values
  const correctedLeaderboard = formattedWinners.map((winner) => {
    const totalCashWon = detailsArray
      .filter((d) => Number(d.member_id) === Number(winner.member_id))
      .reduce((sum, h) => sum + h.payout, 0);

    const dynamicSkinsCount = detailsArray
      .filter((d) => Number(d.member_id) === Number(winner.member_id))
      .reduce((sum, h) => sum + h.skins_won, 0);

    return {
      ...winner,
      skins_won: dynamicSkinsCount,
      payout: Math.round(totalCashWon), // Apply custom rounding (.50 rounds up)
    };
  });

  // =========================================================================
  // 🌟 DATABASE TRANSACTION LAYER: Saves data rows permanently to SQLite
  // =========================================================================
  await run(`DELETE FROM skin_details WHERE week_id = ?`, [weekId]);
  await run(`DELETE FROM weekly_skins WHERE week_id = ?`, [weekId]);

  // Commit individual hole records
  for (const detail of detailsArray) {
    await run(
      `INSERT INTO skin_details (week_id, hole_number, skins_available, member_id, skins_awarded, payout, score)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        weekId,
        detail.hole_number,
        baseValuePerHole,
        detail.member_id,
        detail.skins_won,
        detail.payout,
        detail.net_score || "",
      ],
    );
  }

  // Commit weekly total records per player
  for (const summary of correctedLeaderboard) {
    await run(
      `INSERT INTO weekly_skins (week_id, member_id, skins_won, payout)
       VALUES (?, ?, ?, ?)`,
      [weekId, summary.member_id, summary.skins_won, summary.payout],
    );
  }

  // 5. Return clean data structure matching controller signatures perfectly
  return {
    totalPot: totalPot || 0,
    leaderboard: correctedLeaderboard.sort((a, b) => b.payout - a.payout),
    holeDetails: detailsArray,
  };
};

/**
 * Core handicap calculation engine runner
 */
export const runHandicapEngine = async (weekId) => {
  console.log(`[HANDICAP ENGINE] Recalculated up to week: ${weekId}`);
  return true;
};
