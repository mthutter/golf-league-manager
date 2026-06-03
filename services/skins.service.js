import { all, run } from "../config/db.js"; // Ensure your DB client includes promise or callback bindings

// --- Promise Helpers for SQLite (use if your config/db.js uses callbacks) ---
const dbAll = (sql, params = []) =>
  new Promise((res, rej) => all(sql, params, (e, r) => (e ? rej(e) : res(r))));

/**
 * 1. The Core Skin Calculation Engine
 * Processes individual net holes to find unique low scores for a week.
 */
export const calculateSkins = async (weekId) => {
  if (!weekId) throw new Error("A valid week ID is required.");

  // Fetch hole difficulties
  const holeData = await all(
    `SELECT hole_number, handicap_men FROM holes WHERE hole_number BETWEEN 1 AND 9`,
  );
  const courseHandicaps = {};
  holeData.forEach((h) => {
    courseHandicaps[h.hole_number] = h.handicap_men;
  });

  // Fetch match scorecards signed up for skins
  const rawCards = await all(
    `SELECT s.*, m.name_first, m.name_last FROM scores s 
     LEFT JOIN members m ON s.member_id = m.id 
     WHERE s.week_id = ? AND s.skins_entered = 1`,
    [weekId],
  );

  const skinTotals = {}; // Stores total count per player { playerId: { count: X, holes: [] } }
  const holeScores = {}; // Tracks lowest scores per hole { hole: { minNet: X, winners: [playerId] } }

  // Map net scores for each hole
  rawCards.forEach((player) => {
    const raw9HoleHandicap = player.handicap_used || 0;
    const emulated18Handicap = raw9HoleHandicap * 2;
    const pId = player.member_id;

    for (let h = 1; h <= 9; h++) {
      const gross = player[`gross${h}`] || 0;
      if (gross <= 0) continue;

      const holeDifficultyIndex = courseHandicaps[h] || 18;
      let strokesAllowed = Math.floor(emulated18Handicap / 18);
      if (emulated18Handicap % 18 >= holeDifficultyIndex) {
        strokesAllowed += 1;
      }
      const net = gross - strokesAllowed;

      if (!holeScores[h]) {
        holeScores[h] = { minNet: net, winners: [pId] };
      } else if (net < holeScores[h].minNet) {
        holeScores[h] = { minNet: net, winners: [pId] }; // New outright low score
      } else if (net === holeScores[h].minNet) {
        holeScores[h].winners.push(pId); // Tied hole (halved)
      }
    }
  });

  // Isolate outright skins (holes with exactly ONE winner)
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

  // Calculate distributions based on financial pots
  const buyInCost = 5; // Adjust based on league rules
  const totalPot = rawCards.length * buyInCost;
  const payoutPerSkin =
    totalSkinsWon > 0 ? Object.freeze(totalPot / totalSkinsWon) : 0;

  return {
    skinTotals,
    payoutPerSkin,
    totalPot,
    detailedHoleWinners,
  };
};

/**
 * 2. Interface Router function for API execution
 */
export const runSkinsCalculation = async (weekId) => {
  return calculateSkins(weekId);
};

/**
 * 3. Fetches unique list of historical scoring weeks
 */
export const getWeeksSummary = async () => {
  return all(`SELECT DISTINCT week_id FROM scores ORDER BY week_id DESC`);
};

/**
 * 4. Generates data for EJS rendering matrices
 */
export const buildSkinsReport = async (selectedWeekId) => {
  let leaderboard = [];
  let holeDetails = [];
  let participantScores = [];
  let courseHandicaps = {};
  let totalPot = 0;

  if (!selectedWeekId) {
    return { leaderboard, holeDetails, participantScores, totalPot };
  }

  const holeData = await all(
    `SELECT hole_number, handicap_men FROM holes WHERE hole_number BETWEEN 1 AND 9`,
  );
  holeData.forEach((h) => {
    courseHandicaps[h.hole_number] = h.handicap_men;
  });

  leaderboard = await all(
    `SELECT ws.member_id, m.name_first, m.name_last, ws.skins_won, ws.payout 
     FROM weekly_skins ws LEFT JOIN members m ON ws.member_id = m.id 
     WHERE ws.week_id = ? ORDER BY ws.skins_won DESC, m.name_last ASC`,
    [selectedWeekId],
  );

  holeDetails = await all(
    `SELECT sd.hole_number, sd.score AS net_score, sd.payout, m.name_first, m.name_last, sd.member_id 
     FROM skin_details sd LEFT JOIN members m ON sd.member_id = m.id WHERE sd.week_id = ?`,
    [selectedWeekId],
  );

  const rawCards = await all(
    `SELECT s.*, m.name_first, m.name_last FROM scores s 
     LEFT JOIN members m ON s.member_id = m.id 
     WHERE s.week_id = ? AND s.skins_entered = 1 ORDER BY m.name_last ASC`,
    [selectedWeekId],
  );

  participantScores = rawCards.map((player) => {
    const raw9HoleHandicap = player.handicap_used || 0;
    const emulated18Handicap = raw9HoleHandicap * 2;
    const holesArray = [];

    for (let h = 1; h <= 9; h++) {
      const gross = player[`gross${h}`] || 0;
      const holeDifficultyIndex = courseHandicaps[h] || 18;

      let strokesAllowed = Math.floor(emulated18Handicap / 18);
      if (emulated18Handicap % 18 >= holeDifficultyIndex) {
        strokesAllowed += 1;
      }

      holesArray.push({
        holeNumber: h,
        gross: gross,
        net: gross > 0 ? gross - strokesAllowed : 0,
        strokes: strokesAllowed,
      });
    }

    return {
      memberId: player.member_id,
      name: `${player.name_first} ${player.name_last}`,
      handicap: raw9HoleHandicap,
      holes: holesArray,
    };
  });

  totalPot = leaderboard.reduce((sum, player) => sum + player.payout, 0);

  return { leaderboard, holeDetails, participantScores, totalPot };
};
