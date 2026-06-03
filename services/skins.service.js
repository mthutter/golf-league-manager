import { run, all } from "../config/db.js";
import { SKINS_BUY_IN } from "../config/league.js";

export async function calculateSkins(weekId) {
  console.log(
    `\n============== RUNNING SKINS ENGINE: WEEK ${weekId} ==============`,
  );

  // 1. Clear out old historical rows
  await run(`DELETE FROM skin_details WHERE week_id = ?`, [weekId]);
  await run(`DELETE FROM weekly_skins WHERE week_id = ?`, [weekId]);

  // 2. Fetch the hole configurations from your holes table
  const holeData = await all(
    `SELECT hole_number, handicap_men FROM holes WHERE hole_number BETWEEN 1 AND 9`,
  );

  const courseHandicaps = {};
  holeData.forEach((h) => {
    courseHandicaps[h.hole_number] = h.handicap_men;
  });

  // 3. Fetch players who signed up
  const scorecards = await all(
    `SELECT *, handicap_used FROM scores WHERE week_id = ? AND skins_entered = 1`,
    [weekId],
  );

  if (scorecards.length === 0) {
    return { skinTotals: {}, payoutPerSkin: 0, totalPot: 0 };
  }

  const skinTotals = {};
  const detailedWins = [];

  // --- CARRYOVER LOGIC ENGINE CONFIGURATION ---
  let carryoverPool = 0; // Accumulates skins when 3+ tie
  let totalSkinsAwarded = 0; // The total weight of all won skins (splits count as 0.5 each)

  // 4. Calculate Net Scores per hole using your 18-hole emulation rule
  for (let hole = 1; hole <= 9; hole++) {
    const holeDifficultyIndex = courseHandicaps[hole];
    if (!holeDifficultyIndex) continue;

    const scores = scorecards
      .map((player) => {
        const grossScore = player[`gross${hole}`];
        const raw9HoleHandicap = player.handicap_used || 0;

        // Emulated 18-hole application
        const emulated18Handicap = raw9HoleHandicap * 2;

        let strokesAllowed = Math.floor(emulated18Handicap / 18);
        const leftoverStrokes = emulated18Handicap % 18;

        if (leftoverStrokes >= holeDifficultyIndex) {
          strokesAllowed += 1;
        }

        return {
          memberId: player.member_id,
          grossScore: grossScore,
          score: grossScore - strokesAllowed,
        };
      })
      .filter((x) => x.grossScore > 0);

    if (scores.length === 0) continue;

    // Isolate the low net score and see how many hit it
    const lowNetScore = Math.min(...scores.map((s) => s.score));
    const winners = scores.filter((s) => s.score === lowNetScore);

    // Current hole value is 1 skin, plus whatever came from previous carryovers
    const totalSkinsAvailableOnThisHole = 1 + carryoverPool;

    console.log(
      `Hole ${hole} (Index ${holeDifficultyIndex}): Low Net was ${lowNetScore}. Found ${winners.length} player(s) at this score.`,
    );

    // RULE ACTION 1: Outright Winner (1 player)
    if (winners.length === 1) {
      const winnerId = winners[0].memberId;

      skinTotals[winnerId] =
        (skinTotals[winnerId] || 0) + totalSkinsAvailableOnThisHole;
      totalSkinsAwarded += totalSkinsAvailableOnThisHole;

      detailedWins.push({
        memberId: winnerId,
        holeNumber: hole,
        score: lowNetScore,
        skinsWon: totalSkinsAvailableOnThisHole,
      });

      carryoverPool = 0; // Pool is cleared out!
    }

    // RULE ACTION 2: Two Players Tie (Split the skin values evenly)
    else if (winners.length === 2) {
      const playerA = winners[0].memberId;
      const playerB = winners[1].memberId;
      const splitValue = totalSkinsAvailableOnThisHole / 2;

      skinTotals[playerA] = (skinTotals[playerA] || 0) + splitValue;
      skinTotals[playerB] = (skinTotals[playerB] || 0) + splitValue;
      totalSkinsAwarded += totalSkinsAvailableOnThisHole;

      // Log both players into your detailed item log mapping layout
      detailedWins.push({
        memberId: playerA,
        holeNumber: hole,
        score: lowNetScore,
        skinsWon: splitValue,
      });
      detailedWins.push({
        memberId: playerB,
        holeNumber: hole,
        score: lowNetScore,
        skinsWon: splitValue,
      });

      carryoverPool = 0; // Pool is cleared out!
    }

    // RULE ACTION 3: Three or More Players Tie (Carry over to the next hole)
    else {
      carryoverPool += 1;
      console.log(
        `   ↳ 3+ Tied! Hole ${hole} is pushed. Carryover pool increased to: ${carryoverPool}`,
      );
    }
  }

  // 5. Split Pot Financial Calculations
  const totalPlayers = scorecards.length;
  const totalPot = totalPlayers * SKINS_BUY_IN;

  // Calculate value per raw individual skin unit
  const payoutPerSkinUnit =
    totalSkinsAwarded > 0 ? totalPot / totalSkinsAwarded : 0;

  console.log(
    `[CALC SUMMARY] Total Value Units Awarded: ${totalSkinsAwarded}. Single Unit Payout: $${payoutPerSkinUnit.toFixed(2)}`,
  );
  if (carryoverPool > 0) {
    console.log(
      `⚠️ Hole 9 ended in a 3+ tie. Leftover unawarded skins in pool: ${carryoverPool}`,
    );
  }

  // Write aggregates to weekly_skins
  for (const [memberId, skinsWon] of Object.entries(skinTotals)) {
    const totalPayout = skinsWon * payoutPerSkinUnit;
    await run(
      `INSERT INTO weekly_skins (week_id, member_id, skins_won, payout) 
       VALUES (?, ?, ?, ?)`,
      [weekId, Number(memberId), skinsWon, totalPayout],
    );
  }

  // Write individual hole item lines to skin_details
  for (const win of detailedWins) {
    const calculatedHolePayout = win.skinsWon * payoutPerSkinUnit;
    await run(
      `INSERT INTO skin_details (week_id, member_id, hole_number, score, payout, skins_available) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        weekId,
        win.memberId,
        win.holeNumber,
        win.score,
        calculatedHolePayout,
        win.skinsWon,
      ],
    );
  }

  return { skinTotals, payoutPerSkin: payoutPerSkinUnit, totalPot };
}
