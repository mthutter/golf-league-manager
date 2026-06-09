import { all, run } from "../config/db.js";

/**
 * 1. The Core Skin Calculation Engine
 * Processes unique lowest net scores for a selected week and saves to DB.
 */
export const calculateSkins = async (weekId) => {
  if (!weekId) throw new Error("A valid week ID is required.");

  // Fetch hole handicap profiles
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

  // Fetch scorecards entered into the game
  const rawCards = await all(
    `SELECT s.*, m.name_first, m.name_last, m.sex FROM scores s 
     LEFT JOIN members m ON s.member_id = m.id 
     WHERE s.week_id = ? AND s.skins_entered = 1`,
    [weekId],
  );

  const skinTotals = {};
  const holeScores = {};

  // Compute player handicaps and find low net scores
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

  // Filter out holes with exactly one winner (outright skin)
  let totalSkinsWon = 0;
  const detailedHoleWinners = [];

  Object.entries(holeScores).forEach(([hole, data]) => {
    if (data.winners.length === 1) {
      const winnerId = data.winners[0];
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

export const getWeeksSummary = async () => {
  return all(`SELECT DISTINCT week_id FROM scores ORDER BY week_id DESC`);
};

/**
 * 2. Unified Matrix Builder for EJS Presentation Views
 * Hydrates player metrics by querying the written DB skins records.
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

  // Gather structural course layouts
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

  // Pull leaderboard records written to the DB
  const leaderboard = await all(
    `SELECT ws.member_id, m.name_first, m.name_last, ws.skins_won, ws.payout 
     FROM weekly_skins ws LEFT JOIN members m ON ws.member_id = m.id 
     WHERE ws.week_id = ? ORDER BY ws.skins_won DESC, m.name_last ASC`,
    [selectedWeekId],
  );

  // Pull specific hole payouts written to the DB
  const holeDetails = await all(
    `SELECT sd.hole_number, sd.score AS net_score, sd.payout, m.name_first, m.name_last, sd.member_id 
     FROM skin_details sd LEFT JOIN members m ON sd.member_id = m.id WHERE sd.week_id = ?`,
    [selectedWeekId],
  );

  // Fetch individual scorecards to build row cells
  const rawCards = await all(
    `SELECT s.*, m.name_first, m.name_last, m.sex FROM scores s 
     LEFT JOIN members m ON s.member_id = m.id 
     WHERE s.week_id = ? AND s.skins_entered = 1 ORDER BY m.name_last ASC`,
    [selectedWeekId],
  );

  const participantScores = rawCards.map((player) => {
    const raw9HoleHandicap = player.handicap_used || 0;
    const emulated18Handicap = raw9HoleHandicap * 2;
    const playerSex = (player.sex || "M").toUpperCase();
    const pId = player.member_id;
    const holesArray = [];

    for (let h = 1; h <= 9; h++) {
      const gross = player[`gross${h}`] || 0;
      const holeDifficultyIndex = courseHandicaps[h]
        ? courseHandicaps[h][playerSex]
        : 18;

      let strokesAllowed = Math.floor(emulated18Handicap / 18);
      if (emulated18Handicap % 18 >= holeDifficultyIndex) {
        strokesAllowed += 1;
      }

      holesArray.push({
        holeNumber: h,
        gross: gross,
        net: gross > 0 ? gross - strokesAllowed : 0,
        strokes: strokesAllowed,
        handicap_men: courseHandicaps[h]?.M || 18,
        handicap_women: courseHandicaps[h]?.F || 18,
      });
    }

    // 🌟 THE CRITICAL BACKEND MIGRATION LINK:
    // Locate database summary rows matching this player and append to object parameters
    const matchingLeaderboardRow = leaderboard.find(
      (row) => Number(row.member_id) === Number(pId),
    );

    return {
      memberId: pId,
      name: `${player.name_first} ${player.name_last}`,
      handicap: raw9HoleHandicap,
      sex: playerSex,
      holes: holesArray,
      // Default to 0 instead of running loop aggregations in the template layout
      skins_won: matchingLeaderboardRow
        ? Number(matchingLeaderboardRow.skins_won || 0)
        : 0,
      payout: matchingLeaderboardRow
        ? Number(matchingLeaderboardRow.payout || 0)
        : 0.0,
    };
  });

  const totalPot = leaderboard.reduce((sum, p) => sum + p.payout, 0);

  return { leaderboard, holeDetails, participantScores, totalPot };
};

/**
 * 3. Execution Engine: Calculates Results and Cleanses/Writes to SQLite
 */
export const calculateAndSaveSkins = async (weekId) => {
  const results = await calculateSkins(weekId);

  // Wipes existing transactional rows to avoid duplicate entries
  await run(`DELETE FROM skin_details WHERE week_id = ?`, [weekId]);
  await run(`DELETE FROM weekly_skins WHERE week_id = ?`, [weekId]);

  // Insert hole-by-hole results into the DB
  for (const winner of results.detailedHoleWinners) {
    await run(
      `INSERT INTO skin_details (week_id, hole_number, skins_available, member_id, skins_awarded, payout, score)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        weekId,
        winner.holeNumber,
        results.payoutPerSkin,
        winner.memberId,
        1,
        results.payoutPerSkin,
        winner.score,
      ],
    );
  }

  // Insert aggregate player stats into the DB
  for (const [memberId, data] of Object.entries(results.skinTotals)) {
    await run(
      `INSERT INTO weekly_skins (week_id, member_id, skins_won, payout) VALUES (?, ?, ?, ?)`,
      [
        weekId,
        Number(memberId),
        data.count,
        data.count * results.payoutPerSkin,
      ],
    );
  }

  return results;
};
