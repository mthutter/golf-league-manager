import { all, run } from "../config/db.js";
import { SKINS_BUY_IN } from "../config/league.js";
import { getAllWeeks, getCurrentWeek, getWeekHoleRange } from "../services/weeks.service.js";
import logger from "../utilities/logger.js";
import { buildHoleScores } from "../services/golf.service.js";

export const calculateSkins = async (weekId) => {
  if (!weekId) throw new Error("A valid week ID is required.");
  const { startHole, endHole } = getWeekHoleRange(weekId);

  const holeData = await all(`SELECT * FROM holes WHERE hole_number BETWEEN ? AND ? ORDER BY hole_number`, [startHole, endHole]);

  const courseHandicaps = {};
  holeData.forEach((h) => {
    courseHandicaps[h.hole_number] = { men: h.handicap_men, women: h.handicap_women };
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
    const holes = buildHoleScores(player, holeData, startHole);
    holes.forEach((hole) => {
      const h = hole.holeNumber;
      if (!holeScores[h]) {
        holeScores[h] = { minNet: hole.net, winners: [player.member_id] };
      } else if (hole.net < holeScores[h].minNet) {
        holeScores[h] = { minNet: hole.net, winners: [player.member_id] };
      } else if (hole.net === holeScores[h].minNet) {
        holeScores[h].winners.push(player.member_id);
      }
    });
  });

  const totalPot = rawCards.length * SKINS_BUY_IN;
  const baseValuePerHole = totalPot / 9;
  const detailedHoleWinners = [];
  let carryoverAccumulator = 0;

  // Chronological evaluation from Hole 1 to Hole 9 to manage progressive pots
  let currentSkinStackCount = 0; // Tracks how many holes are packed into the current carryover stack

  for (let h = startHole; h <= endHole; h++) {
    const data = holeScores[h];
    carryoverAccumulator += baseValuePerHole;
    currentSkinStackCount += 1; // Every hole adds 1 skin to the available pool

    if (!data || data.winners.length === 0) continue;

    const winnerCount = data.winners.length;
    // Rule: 1 or 2 players win/split the skin. 3+ triggers a carryover.
    if (winnerCount === 1 || winnerCount === 2) {
      const finalPayoutPool = carryoverAccumulator;
      const totalSkinsInStack = currentSkinStackCount; // Freeze the stack count for this payout

      // Reset both accumulators since they are being cleared out/paid
      carryoverAccumulator = 0;
      currentSkinStackCount = 0;

      const splitPayout = finalPayoutPool / winnerCount;
      // Terminology Fix: Divide the full number of accumulated skins among the winners
      const splitSkinAwarded = totalSkinsInStack / winnerCount;

      data.winners.forEach((winnerId) => {
        if (!skinTotals[winnerId]) {
          skinTotals[winnerId] = { count: 0, payout: 0, holes: [] };
        }
        skinTotals[winnerId].count += splitSkinAwarded;
        skinTotals[winnerId].payout += splitPayout;
        skinTotals[winnerId].holes.push(h);

        detailedHoleWinners.push({
          holeNumber: h,
          memberId: winnerId,
          net_score: data.minNet,
          skins_won: splitSkinAwarded, // This will now save 7.0 or 1.0 down to SQL!
          payout: splitPayout,
        });
      });
    } else {
      // 3+ players tied! Money and skins stay in the accumulator stack
      logger.info(`Hole ${h} tied by ${winnerCount} players. Value carries over.`);
    }
  }

  return { skinTotals, totalPot, detailedHoleWinners, leftoverPot: carryoverAccumulator };
};

export const runSkinsCalculation = async (weekId) => {
  return calculateSkins(weekId);
};
export const getWeeksSummary = async () => {
  return all(`SELECT DISTINCT week_id FROM scores ORDER BY week_id DESC`);
};
export const buildSkinsReport = async (selectedWeekId) => {
  let leaderboard = [],
    holeDetails = [],
    participantScores = [],
    courseHandicaps = {},
    totalPot = 0;
  const week = await getAllWeeks();
  const currentWeek = await getCurrentWeek();
  const { startHole, endHole } = getWeekHoleRange(selectedWeekId);

  const holeInfo = await all(`SELECT hole_number, handicap_men, handicap_women FROM holes WHERE hole_number BETWEEN ? AND ? ORDER BY hole_number`, [startHole, endHole]);

  if (!selectedWeekId) {
    return { leaderboard, holeDetails, participantScores, totalPot, holeInfo, reportTotals: { skins: 0, payout: 0 } };
  }

  holeInfo.forEach((h) => {
    courseHandicaps[h.hole_number] = { men: h.handicap_men, women: h.handicap_women };
  });

  leaderboard = await all(
    `SELECT ws.member_id, m.name_first, m.name_last, ws.skins_won, ws.payout FROM weekly_skins ws 
     LEFT JOIN members m ON ws.member_id = m.id WHERE ws.week_id = ? ORDER BY ws.skins_won DESC, m.name_last ASC`,
    [selectedWeekId],
  );

  holeDetails = await all(
    `SELECT sd.hole_number, sd.score AS net_score, sd.payout, sd.skins_awarded, m.name_first, m.name_last, sd.member_id 
     FROM skin_details sd LEFT JOIN members m ON sd.member_id = m.id WHERE sd.week_id = ?`,
    [selectedWeekId],
  );

  const rawCards = await all(
    `SELECT s.*, m.name_first, m.name_last, m.sex FROM scores s 
     LEFT JOIN members m ON s.member_id = m.id WHERE s.week_id = ? AND s.skins_entered = 1 ORDER BY m.name_last ASC`,
    [selectedWeekId],
  );

  totalPot = rawCards.length * SKINS_BUY_IN;
  const baseValuePerHole = totalPot / 9;
  const holeCarryoverStatus = {};
  let carriedPursePool = 0;
  let currentFeederHoles = [];

  for (let hNum = startHole; hNum <= endHole; hNum++) {
    const winnersForThisHole = holeDetails.filter((d) => Number(d.hole_number) === hNum).length;
    if (winnersForThisHole === 0) {
      carriedPursePool += baseValuePerHole;
      holeCarryoverStatus[hNum] = -1;
      currentFeederHoles.push(hNum);
    } else {
      holeCarryoverStatus[hNum] = carriedPursePool > 0 ? 2 : 0;
      carriedPursePool = 0;
      currentFeederHoles = [];
    }
  }

  const dynamicCards = rawCards.map((player) => {
    const raw9HoleHandicap = player.handicap_used || 0;
    const emulated18Handicap = raw9HoleHandicap * 2;
    const holesArray = [];

    for (let h = startHole; h <= endHole; h++) {
      const gross = player[`gross${h}`] || 0;
      const playerSex = (player.sex || "M").toUpperCase();
      const holeDifficultyIndex = playerSex === "F" ? courseHandicaps[h]?.women || 18 : courseHandicaps[h]?.men || 18;
      let strokesAllowed = Math.floor(emulated18Handicap / 18);
      if (emulated18Handicap % 18 >= holeDifficultyIndex) strokesAllowed += 1;
      const net = gross > 0 ? gross - strokesAllowed : 0;

      holesArray.push({ holeNumber: h, gross, net, strokes: gross > 0 ? strokesAllowed : 0, cellClass: "" });
    }
    return { memberId: player.member_id, name: `${player.name_first} ${player.name_last}`, handicap: raw9HoleHandicap, holes: holesArray };
  });

  for (let h = startHole; h <= endHole; h++) {
    const carryStatus = holeCarryoverStatus[h] !== undefined ? holeCarryoverStatus[h] : 0;
    if (carryStatus === -1) {
      const validScores = dynamicCards.map((p) => p.holes.find((hole) => hole.holeNumber === h).net).filter((n) => n > 0);
      if (validScores.length > 0) {
        const minNetValue = Math.min(...validScores);
        dynamicCards.forEach((p) => {
          const targetHole = p.holes.find((hole) => hole.holeNumber === h);
          if (targetHole && targetHole.net === minNetValue) {
            targetHole.cellClass = "skin-tie-pushed-cell";
          }
        });
      }
    } else {
      dynamicCards.forEach((p) => {
        const targetHole = p.holes.find((hole) => hole.holeNumber === h);
        const isSkinWinner = holeDetails.some((d) => Number(d.hole_number) === h && Number(d.member_id) === Number(p.memberId));
        if (isSkinWinner) {
          targetHole.cellClass = carryStatus === 2 ? "skin-carryover-winner-card" : "skin-winner-card fw-bold";
        }
      });
    }
  }

  participantScores = dynamicCards.map((p) => {
    const leaderboardRow = leaderboard.find((l) => Number(l.member_id) === Number(p.memberId)) || { skins_won: 0, payout: 0 };

    const displaySkinsWon = p.holes.reduce((sum, h) => {
      if (h.cellClass === "skin-winner-card fw-bold" || h.cellClass === "skin-carryover-winner-card") {
        const detailRecord = holeDetails.find((d) => Number(d.hole_number) === h.holeNumber && Number(d.member_id) === Number(p.memberId));
        return sum + (detailRecord ? Number(detailRecord.skins_awarded || 1) : 1);
      }
      return sum;
    }, 0);

    return {
      ...p,
      skinsWon: displaySkinsWon,
      payout: Number(leaderboardRow.payout || 0),
      currentWeek,
      week,
    };
  });

  const reportTotals = {
    skins: participantScores.reduce((sum, p) => sum + Number(p.skinsWon || 0), 0),
    payout: participantScores.reduce((sum, p) => sum + Number(p.payout || 0), 0),
  };

  return { leaderboard, holeDetails, participantScores, totalPot, holeInfo, reportTotals };
};

export const calculateAndSaveSkins = async (weekId) => {
  const results = await calculateSkins(weekId);
  await run(`DELETE FROM skin_details WHERE week_id = ?`, [weekId]);
  await run(`DELETE FROM weekly_skins WHERE week_id = ?`, [weekId]);
  const baseValuePerHole = results.totalPot / 9;

  for (const winner of results.detailedHoleWinners) {
    await run(`INSERT INTO skin_details (week_id, hole_number, skins_available, member_id, skins_awarded, payout, score) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
      weekId,
      winner.holeNumber,
      baseValuePerHole,
      winner.memberId,
      winner.skins_won,
      winner.payout,
      winner.net_score,
    ]);
  }

  for (const [memberId, data] of Object.entries(results.skinTotals)) {
    await run(`INSERT INTO weekly_skins (week_id, member_id, skins_won, payout) VALUES (?, ?, ?, ?)`, [weekId, Number(memberId), data.count, data.payout]);
  }
  return results;
};

export const saveSkinDetails = async (weekId, holeDetails, totalPot) => {
  await run(`DELETE FROM skin_details WHERE week_id = ?`, [weekId]);
  const baseValuePerHole = totalPot / 9;
  for (const detail of holeDetails) {
    await run(`INSERT INTO skin_details (week_id, hole_number, skins_available, member_id, skins_awarded, payout, score) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
      weekId,
      detail.hole_number,
      baseValuePerHole,
      detail.member_id,
      detail.skins_won,
      detail.payout,
      detail.net_score,
    ]);
  }
};
