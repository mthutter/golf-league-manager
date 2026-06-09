import { all, run } from "../config/db.js";

/**
 * 1. The Core Skin Calculation Engine
 * Processes unique lowest net scores for a selected week.
 */
export const calculateSkins = async (weekId) => {
  if (!weekId) throw new Error("A valid week ID is required.");

  const holeData = await all(
    `SELECT hole_number, handicap_men, handicap_women FROM holes WHERE hole_number BETWEEN 1 AND 9`,
  );
  const courseHandicaps = {};
  holeData.forEach((h) => {
    courseHandicaps[h.hole_number] = {
      M: h.handicap_men || 18,
      F: h.handicap_women || 18,
    };
  });

  const rawCards = await all(
    `SELECT s.*, m.name_first, m.name_last, m.sex FROM scores s 
     LEFT JOIN members m ON s.member_id = m.id 
     WHERE s.week_id = ? AND s.skins_entered = 1`,
    [weekId],
  );

  const skinTotals = {};
  const holeScores = {};

  rawCards.forEach((player) => {
    const raw9HoleHandicap = player.handicap_used || 0;
    const emulated18Handicap = raw9HoleHandicap * 2;
    const pId = player.member_id;
    const playerSex = (player.sex || "M").toUpperCase();

    for (let h = 1; h <= 9; h++) {
      const gross = player[`gross${h}`] || 0;
      if (gross <= 0) continue;

      const holeDifficultyIndex = courseHandicaps[h]
        ? courseHandicaps[h][playerSex]
        : 18;
      let strokesAllowed = Math.floor(emulated18Handicap / 18);
      if (emulated18Handicap % 18 >= holeDifficultyIndex) {
        strokesAllowed += 1;
      }
      const net = gross - strokesAllowed;

      if (!holeScores[h]) {
        holeScores[h] = { minNet: net, winners: [pId] };
      } else if (net < holeScores[h].minNet) {
        holeScores[h] = { minNet: net, winners: [pId] };
      } else if (net === holeScores[h].minNet) {
        holeScores[h].winners.push(pId);
      }
    }
  });

  let totalSkinsWon = 0;
  const detailedHoleWinners = [];

  Object.entries(holeScores).forEach(([hole, data]) => {
    if (data.winners.length === 1) {
      const winnerId = data.winners[0]; // Extract string ID instead of array object
      totalSkinsWon += 1;

      if (!skinTotals[winnerId]) {
        skinTotals[winnerId] = { count: 0, holes: [] };
      }
      skinTotals[winnerId].count += 1;
      skinTotals[winnerId].holes.push(Number(hole));

      detailedHoleWinners.push({
        holeNumber: Number(hole),
        memberId: winnerId,
        score: data.minNet,
      });
    }
  });

  const buyInCost = 5;
  const totalPot = rawCards.length * buyInCost;
  const payoutPerSkin = totalSkinsWon > 0 ? totalPot / totalSkinsWon : 0;

  return { skinTotals, payoutPerSkin, totalPot, detailedHoleWinners };
};

export const runSkinsCalculation = async (weekId) => {
  return calculateSkins(weekId);
};

/**
 * 3. Fetches unique list of historical scoring weeks directly from weeks2026 table
 */
export const getWeeksSummary = async () => {
  return all(
    `SELECT week_number AS week_id, date AS display_date FROM weeks2026 ORDER BY week_number DESC`,
  );
};

/**
 * 2. Unified Matrix Builder for EJS Presentation Views
 * Handles full sequential carryover data normalization before view building.
 */
export const buildSkinsReport = async (selectedWeekId) => {
  if (!selectedWeekId) {
    return {
      leaderboard: [],
      holeDetails: [],
      participantScores: [],
      totalPot: 0,
    };
  }

  const holeData = await all(
    `SELECT hole_number, handicap_men, handicap_women FROM holes WHERE hole_number BETWEEN 1 AND 9`,
  );
  const courseHandicaps = {};
  holeData.forEach((h) => {
    courseHandicaps[h.hole_number] = {
      M: h.handicap_men || 18,
      F: h.handicap_women || 18,
    };
  });

  const leaderboard = await all(
    `SELECT ws.member_id, m.name_first, m.name_last, ws.skins_won, ws.payout 
     FROM weekly_skins ws LEFT JOIN members m ON ws.week_id = m.id 
     WHERE ws.week_id = ? ORDER BY ws.skins_won DESC, m.name_last ASC`,
    [selectedWeekId],
  );

  const holeDetails = await all(
    `SELECT sd.hole_number, sd.score AS net_score, sd.payout, m.name_first, m.name_last, sd.member_id 
     FROM skin_details sd LEFT JOIN members m ON sd.member_id = m.id WHERE sd.week_id = ?`,
    [selectedWeekId],
  );

  const rawCards = await all(
    `SELECT s.*, m.name_first, m.name_last, m.sex FROM scores s 
     LEFT JOIN members m ON s.member_id = m.id 
     WHERE s.week_id = ? AND s.skins_entered = 1 ORDER BY m.name_last ASC`,
    [selectedWeekId],
  );

  const totalPotValue = leaderboard.reduce((sum, p) => sum + p.payout, 0);
  const baseValuePerHole = totalPotValue / 9;
  let carriedPursePool = 0;
  const holeCarryoverStatus = {};

  for (let hNum = 1; hNum <= 9; hNum++) {
    const winnersForThisHole = holeDetails.filter(
      (d) => Number(d.hole_number) === hNum,
    ).length;
    if (winnersForThisHole === 0) {
      carriedPursePool += baseValuePerHole;
      holeCarryoverStatus[hNum] = 1;
    } else {
      holeCarryoverStatus[hNum] = carriedPursePool > 0 ? 2 : 0;
      carriedPursePool = 0;
    }
  }

  const participantScores = rawCards.map((player) => {
    const raw9HoleHandicap = player.handicap_used || 0;
    const emulated18Handicap = raw9HoleHandicap * 2;
    const playerSex = (player.sex || "M").toUpperCase();
    const pId = player.member_id;
    const holesArray = [];
    let dynamicSkinsCount = 0;

    for (let h = 1; h <= 9; h++) {
      const gross = player[`gross${h}`] || 0;
      const holeDifficultyIndex = courseHandicaps[h]
        ? courseHandicaps[h][playerSex]
        : 18;

      let strokesAllowed = Math.floor(emulated18Handicap / 18);
      if (emulated18Handicap % 18 >= holeDifficultyIndex) {
        strokesAllowed += 1;
      }

      const isSkinWinner = holeDetails.some(
        (d) => Number(d.hole_number) === h && Number(d.member_id) === pId,
      );
      const carryStatus = holeCarryoverStatus[h] || 0;
      let playerWonThisSequence = false;

      if (carryStatus === 1) {
        for (let nextHole = h + 1; nextHole <= 9; nextHole++) {
          if (holeDetails.some((d) => Number(d.hole_number) === nextHole)) {
            if (
              holeDetails.some(
                (d) =>
                  Number(d.hole_number) === nextHole &&
                  Number(d.member_id) === pId,
              )
            ) {
              playerWonThisSequence = true;
            }
            break;
          }
        }
      }

      let isFeeder = false;
      let isJackpot = false;

      if (isSkinWinner) {
        if (carryStatus === 2) isJackpot = true;
        dynamicSkinsCount += 1;
      } else if (carryStatus === 1 && playerWonThisSequence) {
        isFeeder = true;
        dynamicSkinsCount += 1;
      }

      holesArray.push({
        holeNumber: h,
        gross: gross,
        net: gross > 0 ? gross - strokesAllowed : 0,
        strokes: strokesAllowed,
        handicap_men: courseHandicaps[h]?.M || 18,
        handicap_women: courseHandicaps[h]?.F || 18,
        isSkinWinner,
        isFeeder,
        isJackpot,
      });
    }

    const matchingLeaderboardRow = leaderboard.find(
      (row) => Number(row.member_id) === Number(pId),
    );

    return {
      memberId: pId,
      name: `${player.name_first} ${player.name_last}`,
      handicap: raw9HoleHandicap,
      sex: playerSex,
      holes: holesArray,
      skins_won: dynamicSkinsCount,
      payout: matchingLeaderboardRow
        ? Number(matchingLeaderboardRow.payout || 0)
        : 0.0,
    };
  });

  return {
    leaderboard,
    holeDetails,
    participantScores,
    totalPot: totalPotValue,
  };
};
/**
 * 3. Execution Engine: Calculates Results, Runs Carryovers, and Writes to Database
 */
export const calculateAndSaveSkins = async (weekId) => {
  // 1. Run raw calculation engine
  const results = await calculateSkins(weekId);
  const baseValuePerHole = Number(results.totalPot || 0) / 9;

  // 2. Clear out any stale records for this week to prevent primary key duplicates
  await run(`DELETE FROM skin_details WHERE week_id = ?`, [weekId]);
  await run(`DELETE FROM weekly_skins WHERE week_id = ?`, [weekId]);

  // 3. Process the sequential hole carryover calculations on the server
  let carriedPursePool = 0;
  const holePayouts = {};
  const holeCarryoverStatus = {};

  for (let hNum = 1; hNum <= 9; hNum++) {
    const winnersForThisHole = results.detailedHoleWinners.filter(
      (w) => w.holeNumber === hNum,
    ).length;
    const activeHoleValue = baseValuePerHole + carriedPursePool;

    if (winnersForThisHole === 0) {
      carriedPursePool += baseValuePerHole;
      holePayouts[hNum] = 0;
      holeCarryoverStatus[hNum] = 1; // Pushed/Feeder hole
    } else {
      holePayouts[hNum] = activeHoleValue;
      holeCarryoverStatus[hNum] = carriedPursePool > 0 ? 2 : 0; // Jackpot collector vs Standard
      carriedPursePool = 0; // Reset roll pool
    }
  }

  // Handle final hole tie edge case: distribute leftover back to active winners
  if (carriedPursePool > 0) {
    let wonHolesCount = 0;
    for (let h = 1; h <= 9; h++) {
      if (holePayouts[h] > 0) wonHolesCount++;
    }
    if (wonHolesCount > 0) {
      const splitBonus = carriedPursePool / wonHolesCount;
      for (let h = 1; h <= 9; h++) {
        if (holePayouts[h] > 0) holePayouts[h] += splitBonus;
      }
    }
  }

  // 4. Save adjusted individual hole metrics to the skin_details table
  const playerWeeklySkins = {};

  for (let hNum = 1; hNum <= 9; hNum++) {
    const winnerRecord = results.detailedHoleWinners.find(
      (w) => w.holeNumber === hNum,
    );
    const carryStatus = holeCarryoverStatus[hNum];

    if (winnerRecord) {
      const pId = winnerRecord.memberId;
      if (!playerWeeklySkins[pId])
        playerWeeklySkins[pId] = { skins_won: 0, payout: 0 };

      playerWeeklySkins[pId].skins_won += 1;
      playerWeeklySkins[pId].payout += holePayouts[hNum];

      await run(
        `INSERT INTO skin_details (week_id, hole_number, skins_available, member_id, skins_awarded, payout, score)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          weekId,
          hNum,
          baseValuePerHole,
          pId,
          1,
          holePayouts[hNum],
          winnerRecord.score,
        ],
      );
    }

    // Trace backward to award historical feeder skins to the rolling jackpot winner
    if (carryStatus === 2 && winnerRecord) {
      const pId = winnerRecord.memberId;
      for (let prevHole = hNum - 1; prevHole >= 1; prevHole--) {
        if (holeCarryoverStatus[prevHole] === 1) {
          playerWeeklySkins[pId].skins_won += 1; // Award feeder skin count credit

          // Write feeder hole structural record into DB
          await run(
            `INSERT INTO skin_details (week_id, hole_number, skins_available, member_id, skins_awarded, payout, score)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [weekId, prevHole, baseValuePerHole, pId, 1, 0, ""],
          );
        } else {
          break; // Stop tracing back if we hit a previously won hole
        }
      }
    }
  }

  // 5. Save final aggregated leaderboard rows to weekly_skins table
  for (const [memberId, stats] of Object.entries(playerWeeklySkins)) {
    await run(
      `INSERT INTO weekly_skins (week_id, member_id, skins_won, payout) VALUES (?, ?, ?, ?)`,
      [weekId, Number(memberId), stats.skins_won, Math.round(stats.payout)],
    );
  }

  return results;
};
