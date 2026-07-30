import { all, run } from "../config/db.js"; // Ensure your DB client includes promise or callback bindings
import { SKINS_BUY_IN } from "../config/league.js";
import {
  getAllWeeks,
  getCurrentWeek,
  getWeekHoleRange,
} from "../services/weeks.service.js";
import logger from "../utilities/logger.js";
import { buildHoleScores } from "../services/golf.service.js";

export const calculateSkins = async (weekId) => {
  if (!weekId) throw new Error("A valid week ID is required.");

  // Fetch hole difficulties

  const { startHole, endHole } = getWeekHoleRange(weekId);

  const holeData = await all(
    `
  SELECT *
  FROM holes
  WHERE hole_number BETWEEN ? AND ?
  ORDER BY hole_number
  `,
    [startHole, endHole],
  );

  const courseMap = new Map(holeData.map((hole) => [hole.hole_number, hole]));

  const courseHandicaps = {};
  holeData.forEach((h) => {
    courseHandicaps[h.hole_number] = {
      men: h.handicap_men,
      women: h.handicap_women,
    };
  });

  // Fetch match scorecards signed up for skins
  const rawCards = await all(
    `SELECT s.*, m.name_first, m.name_last, m.sex FROM scores s LEFT JOIN members m ON s.member_id = m.id WHERE s.week_id = ? AND s.skins_entered = 1`,
    [weekId],
  );

  const skinTotals = {}; // Stores total count/fraction per player
  const holeScores = {}; // Tracks lowest scores per hole

  // Map net scores for each hole
  rawCards.forEach((player) => {
    const holes = buildHoleScores(player, holeData, startHole);

    holes.forEach((hole) => {
      const h = hole.holeNumber;

      if (!holeScores[h]) {
        holeScores[h] = {
          minNet: hole.net,
          winners: [player.member_id],
        };
      } else if (hole.net < holeScores[h].minNet) {
        holeScores[h] = {
          minNet: hole.net,
          winners: [player.member_id],
        };
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
  for (let h = startHole; h <= endHole; h++) {
    const data = holeScores[h];
    carryoverAccumulator += baseValuePerHole;

    if (!data || data.winners.length === 0) {
      // No scores recorded for this hole, money automatically carries over
      continue;
    }

    const winnerCount = data.winners.length;

    // Rule: 1 or 2 players win/split the skin. 3+ triggers a carryover.
    if (winnerCount === 1 || winnerCount === 2) {
      const finalPayoutPool = carryoverAccumulator;
      carryoverAccumulator = 0; // Reset the carry pool since it's being paid out

      const splitPayout = finalPayoutPool / winnerCount;
      const splitSkinAwarded = 1 / winnerCount;

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
          skins_won: splitSkinAwarded,
          payout: splitPayout,
        });
      });
    } else {
      // 3+ players tied! Money stays in carryoverAccumulator and advances to the next hole
      logger.info(
        `Hole ${h} tied by ${winnerCount} players. Value of ${baseValuePerHole.toFixed(2)} carries over.`,
      );
    }
  }

  // Handle leftover money on Hole 9 if it was a carryover
  // Depending on your league, this either goes back to the league, roll over to next week,
  // or gets paid back to the players. Currently, it just remains unallocated.

  return {
    skinTotals,
    totalPot,
    detailedHoleWinners,
    leftoverPot: carryoverAccumulator, // Tracking unresolved money just in case
  };
};

export const runSkinsCalculation = async (weekId) => {
  return calculateSkins(weekId);
};

export const getWeeksSummary = async () => {
  return all(`SELECT DISTINCT week_id FROM scores ORDER BY week_id DESC`);
};

export const buildSkinsReport = async (selectedWeekId) => {
  let leaderboard = [];
  let holeDetails = [];
  let participantScores = [];
  let courseHandicaps = {};
  let totalPot = 0;

  const week = await getAllWeeks();
  const currentWeek = await getCurrentWeek();
  const { startHole, endHole } = getWeekHoleRange(selectedWeekId);

  const holeInfo = await all(`
    SELECT
      hole_number,
      handicap_men,
      handicap_women
    FROM holes
    WHERE hole_number BETWEEN startHole AND endHole
    ORDER BY hole_number
  `);

  if (!selectedWeekId) {
    return {
      leaderboard,
      holeDetails,
      participantScores,
      totalPot,
      holeInfo,
      reportTotals: {
        skins: 0,
        payout: 0,
      },
    };
  }

  const holeData = await all(`
    SELECT
      hole_number,
      handicap_men,
      handicap_women
    FROM holes
    WHERE hole_number BETWEEN startHole AND endHole
  `);

  holeData.forEach((h) => {
    courseHandicaps[h.hole_number] = {
      men: h.handicap_men,
      women: h.handicap_women,
    };
  });

  leaderboard = await all(
    `
    SELECT
      ws.member_id,
      m.name_first,
      m.name_last,
      ws.skins_won,
      ws.payout
    FROM weekly_skins ws
    LEFT JOIN members m
      ON ws.member_id = m.id
    WHERE ws.week_id = ?
    ORDER BY ws.skins_won DESC, m.name_last ASC
    `,
    [selectedWeekId],
  );

  holeDetails = await all(
    `
    SELECT
      sd.hole_number,
      sd.score AS net_score,
      sd.payout,
      sd.skins_awarded,
      m.name_first,
      m.name_last,
      sd.member_id
    FROM skin_details sd
    LEFT JOIN members m
      ON sd.member_id = m.id
    WHERE sd.week_id = ?
    `,
    [selectedWeekId],
  );

  const rawCards = await all(
    `
    SELECT
      s.*,
      m.name_first,
      m.name_last,
      m.sex
    FROM scores s
    LEFT JOIN members m
      ON s.member_id = m.id
    WHERE s.week_id = ?
      AND s.skins_entered = 1
    ORDER BY m.name_last ASC
    `,
    [selectedWeekId],
  );

  //totalPot = leaderboard.reduce((sum, player) => sum + Number(player.payout || 0), 0);
  totalPot = rawCards.length * SKINS_BUY_IN;

  const holeCarryoverStatus = {};

  const baseValuePerHole = totalPot / 9;

  let carriedPursePool = 0;
  let currentFeederHoles = [];

  for (let hNum = startHole; hNum <= endHole; hNum++) {
    const winnersForThisHole = holeDetails.filter(
      (d) => Number(d.hole_number) === hNum,
    ).length;

    if (winnersForThisHole === 0) {
      carriedPursePool += baseValuePerHole;

      holeCarryoverStatus[hNum] = -1;

      currentFeederHoles.push(hNum);
    } else {
      if (carriedPursePool > 0) {
        holeCarryoverStatus[hNum] = 2;

        currentFeederHoles.forEach((fHole) => {
          holeCarryoverStatus[fHole] = 1;
        });
      } else {
        holeCarryoverStatus[hNum] = 0;
      }

      carriedPursePool = 0;
      currentFeederHoles = [];
    }
  }

  participantScores = rawCards.map((player) => {
    const raw9HoleHandicap = player.handicap_used || 0;

    const emulated18Handicap = raw9HoleHandicap * 2;

    const leaderboardRow = leaderboard.find(
      (l) => Number(l.member_id) === Number(player.member_id),
    ) || {
      skins_won: 0,
      payout: 0,
    };

    const holesArray = [];

    for (let h = startHole; h <= endHole; h++) {
      const gross = player[`gross${h}`] || 0;

      const playerSex = (player.sex || "M").toUpperCase();

      const holeDifficultyIndex =
        playerSex === "F"
          ? courseHandicaps[h]?.women || 18
          : courseHandicaps[h]?.men || 18;

      let strokesAllowed = Math.floor(emulated18Handicap / 18);

      if (emulated18Handicap % 18 >= holeDifficultyIndex) {
        strokesAllowed += 1;
      }

      const net = gross > 0 ? gross - strokesAllowed : 0;

      let cellClass = "";

      const isSkinWinner = holeDetails.some((d) => {
        return (
          Number(d.hole_number) === h &&
          Number(d.member_id) === Number(player.member_id)
        );
      });

      const carryStatus = holeCarryoverStatus[h] || 0;

      let playerWonThisSequence = false;

      if (carryStatus === 1) {
        for (let nextHole = h + 1; nextHole <= 18; nextHole++) {
          const holeHasWinner = holeDetails.some(
            (d) => Number(d.hole_number) === nextHole,
          );

          if (holeHasWinner) {
            playerWonThisSequence = holeDetails.some((d) => {
              return (
                Number(d.hole_number) === nextHole &&
                Number(d.member_id) === Number(player.member_id)
              );
            });

            break;
          }
        }
      }

      if (isSkinWinner) {
        cellClass =
          carryStatus === 2
            ? "skin-carryover-winner-card"
            : "skin-winner-card fw-bold";
      } else if (carryStatus === 1 && playerWonThisSequence) {
        cellClass = "skin-carryover-feeder-cell";
      }

      holesArray.push({
        holeNumber: h,
        gross,
        net,
        strokes: gross > 0 ? strokesAllowed : 0,
        cellClass,
      });
    }

    const displaySkinsWon = holesArray.filter((hole) => {
      return (
        hole.cellClass === "skin-winner-card fw-bold" ||
        hole.cellClass === "skin-carryover-winner-card" ||
        hole.cellClass === "skin-carryover-feeder-cell"
      );
    }).length;

    return {
      memberId: player.member_id,
      name: `${player.name_first} ${player.name_last}`,
      handicap: raw9HoleHandicap,
      skinsWon: displaySkinsWon,
      payout: Number(leaderboardRow.payout || 0),
      holes: holesArray,
      currentWeek,
      week,
    };
  });

  const reportTotals = {
    skins: participantScores.reduce(
      (sum, p) => sum + Number(p.skinsWon || 0),
      0,
    ),

    payout: participantScores.reduce(
      (sum, p) => sum + Number(p.payout || 0),
      0,
    ),
  };

  return {
    leaderboard,
    holeDetails,
    participantScores,
    totalPot,
    holeInfo,
    reportTotals,
  };
};

export const calculateAndSaveSkins = async (weekId) => {
  const results = await calculateSkins(weekId);

  await run(`DELETE FROM skin_details WHERE week_id = ?`, [weekId]);
  await run(`DELETE FROM weekly_skins WHERE week_id = ?`, [weekId]);

  const baseValuePerHole = results.totalPot / 9;

  for (const winner of results.detailedHoleWinners) {
    await run(
      `INSERT INTO skin_details (
        week_id, hole_number, skins_available, member_id, skins_awarded, payout, score
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        weekId,
        winner.holeNumber,
        baseValuePerHole,
        winner.memberId,
        winner.skins_won,
        winner.payout,
        winner.net_score,
      ],
    );
  }

  for (const [memberId, data] of Object.entries(results.skinTotals)) {
    await run(
      `INSERT INTO weekly_skins (
        week_id, member_id, skins_won, payout
      ) VALUES (?, ?, ?, ?)`,
      [weekId, Number(memberId), data.count, data.payout],
    );
  }

  return results;
};

export const saveSkinDetails = async (weekId, holeDetails, totalPot) => {
  await run(
    `
    DELETE FROM skin_details
    WHERE week_id = ?
    `,
    [weekId],
  );

  const baseValuePerHole = totalPot / 9;

  for (const detail of holeDetails) {
    await run(
      `
      INSERT INTO skin_details
      (
        week_id,
        hole_number,
        skins_available,
        member_id,
        skins_awarded,
        payout,
        score
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        weekId,
        detail.hole_number,
        baseValuePerHole,
        detail.member_id,
        detail.skins_won,
        detail.payout,
        detail.net_score,
      ],
    );
  }
};
