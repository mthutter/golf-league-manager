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
  console.log(`[DB CHECK] Found ${holeData.length} hole handicap records.`);

  // 3. Fetch players who signed up
  const scorecards = await all(
    `SELECT *, handicap_used FROM scores WHERE week_id = ? AND skins_entered = 1`,
    [weekId],
  );

  console.log(
    `[DB CHECK] Found ${scorecards.length} active players matching query constraints for Week ${weekId}.`,
  );

  if (scorecards.length === 0) {
    console.log(
      "⚠️ Exiting Early: Zero scorecards pulled. Check 'skins_entered' or 'week_id' column data formats.",
    );
    return { skinTotals: {}, payoutPerSkin: 0, totalPot: 0 };
  }

  const skinTotals = {};
  const detailedWins = [];
  let totalSkinsWonPool = 0;

  // 4. Calculate Net Scores per hole using your 18-hole emulation rule
  for (let hole = 1; hole <= 9; hole++) {
    const holeDifficultyIndex = courseHandicaps[hole];
    if (!holeDifficultyIndex) {
      console.log(
        `⚠️ Missing difficulty index rating for Hole ${hole}. Skipping hole evaluation.`,
      );
      continue;
    }

    const scores = scorecards
      .map((player) => {
        const grossScore = player[`gross${hole}`];
        const raw9HoleHandicap = player.handicap_used || 0;

        // Emulated 18-hole application (doubling the 9-hole league values)
        const emulated18Handicap = raw9HoleHandicap * 2;

        let strokesAllowed = 0;
        if (emulated18Handicap > 0) {
          strokesAllowed = Math.floor(
            (emulated18Handicap - holeDifficultyIndex + 18) / 18,
          );
          if (
            emulated18Handicap >= holeDifficultyIndex &&
            strokesAllowed === 0
          ) {
            strokesAllowed = 1;
          }
        }

        const netScore = grossScore - strokesAllowed;

        return {
          memberId: player.member_id,
          grossScore: grossScore,
          score: netScore,
        };
      })
      .filter((x) => x.grossScore > 0);

    if (scores.length === 0) continue;

    // 5. Evaluate the outright skin winner
    const lowNetScore = Math.min(...scores.map((s) => s.score));
    const winners = scores.filter((s) => s.score === lowNetScore);

    console.log(
      `Hole ${hole} (Index ${holeDifficultyIndex}): Low Net was ${lowNetScore}. Found ${winners.length} player(s) at this score.`,
    );

    if (winners.length !== 1) {
      // Tie = hole is split/halved
      continue;
    }

    const holeWinner = winners[0];
    const winnerId = holeWinner.memberId;

    skinTotals[winnerId] = (skinTotals[winnerId] || 0) + 1;
    totalSkinsWonPool++;

    detailedWins.push({
      memberId: winnerId,
      holeNumber: hole,
      score: holeWinner.score,
    });
  }

  // 6. Split Pot Financial Calculations
  const totalPlayers = scorecards.length;
  const totalPot = totalPlayers * SKINS_BUY_IN;
  const payoutPerSkin =
    totalSkinsWonPool > 0 ? totalPot / totalSkinsWonPool : 0;

  console.log(
    `[CALC SUMMARY] Total Skins Won Across Board: ${totalSkinsWonPool}. Payout Per Skin: $${payoutPerSkin.toFixed(2)}`,
  );

  // Write aggregates to weekly_skins
  let weeklySkinsInserts = 0;
  for (const [memberId, skinsWon] of Object.entries(skinTotals)) {
    const totalPayout = skinsWon * payoutPerSkin;
    await run(
      `INSERT INTO weekly_skins (week_id, member_id, skins_won, payout) 
       VALUES (?, ?, ?, ?)`,
      [weekId, Number(memberId), skinsWon, totalPayout],
    );
    weeklySkinsInserts++;
  }

  // Write individual hole item lines to skin_details
  // ADDED FIX: Included 'skins_available' column explicitly passing a default of 1
  let skinDetailsInserts = 0;
  for (const win of detailedWins) {
    await run(
      `INSERT INTO skin_details (week_id, member_id, hole_number, score, payout, skins_available) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [weekId, win.memberId, win.holeNumber, win.score, payoutPerSkin, 1],
    );
    skinDetailsInserts++;
  }

  console.log(
    `[DB WRITE] Inserted ${weeklySkinsInserts} summary rows and ${skinDetailsInserts} detail rows.\n`,
  );

  return { skinTotals, payoutPerSkin, totalPot };
}
