import { all, run } from "../config/db.js"; // Ensure your DB client includes promise or callback bindings
import { getAllWeeks, getCurrentWeek } from "../services/weeks.service.js";

export const calculateSkins = async (weekId) => {
  if (!weekId) throw new Error("A valid week ID is required.");

  // Fetch hole difficulties
  const holeData = await all(
    `
  SELECT
    hole_number,
    handicap_men,
    handicap_women
  FROM holes
  WHERE hole_number BETWEEN 1 AND 9
  `,
  );

  const courseHandicaps = {};

  holeData.forEach((h) => {
    courseHandicaps[h.hole_number] = {
      men: h.handicap_men,
      women: h.handicap_women,
    };
  });

  // Fetch match scorecards signed up for skins
  const rawCards = await all(
    `SELECT s.*, m.name_first, m.name_last, m.sex FROM scores s 
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

      const playerSex = (player.sex || "M").toUpperCase();

      const holeDifficultyIndex =
        playerSex === "F"
          ? courseHandicaps[h]?.women || 18
          : courseHandicaps[h]?.men || 18;
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
        net_score: data.minNet,
        skins_won: 1,
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

  const holeInfo = await all(`
    SELECT
      hole_number,
      handicap_men,
      handicap_women
    FROM holes
    WHERE hole_number BETWEEN 1 AND 9
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
    WHERE hole_number BETWEEN 1 AND 9
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

  totalPot = leaderboard.reduce(
    (sum, player) => sum + Number(player.payout || 0),
    0,
  );

  const holeCarryoverStatus = {};

  const baseValuePerHole = totalPot / 9;

  let carriedPursePool = 0;
  let currentFeederHoles = [];

  for (let hNum = 1; hNum <= 9; hNum++) {
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

    for (let h = 1; h <= 9; h++) {
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
        for (let nextHole = h + 1; nextHole <= 9; nextHole++) {
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

  await run(
    `
    DELETE FROM skin_details
    WHERE week_id = ?
    `,
    [weekId],
  );

  await run(
    `
  DELETE FROM weekly_skins
  WHERE week_id = ?
  `,
    [weekId],
  );

  for (const winner of results.detailedHoleWinners) {
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
        winner.holeNumber,
        results.payoutPerSkin,
        winner.memberId,
        1,
        results.payoutPerSkin,
        winner.net_score,
      ],
    );
  }
  for (const [memberId, data] of Object.entries(results.skinTotals)) {
    await run(
      `
    INSERT INTO weekly_skins
    (
      week_id,
      member_id,
      skins_won,
      payout
    )
    VALUES (?, ?, ?, ?)
    `,
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
