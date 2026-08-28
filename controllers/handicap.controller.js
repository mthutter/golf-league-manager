// controllers/handicap.controller.js
import {
  getFilteredHandicapHistory,
  getHandicapFilterMetadata,
} from "../services/handicap.service.js";

/**
 * Compute the 100% cumulative handicap index using Option B (Standard Mathematical Rounding)
 * Evaluates raw scores against a 9-hole base par of 36.
 */
function computeCumulativeHandicap(allRounds, coursePar = 36) {
  const validRounds = allRounds.filter((round) => {
    const gross = parseFloat(
      round.gross_score || round.gross_total || round.total_score,
    );
    return !isNaN(gross) && gross > 0;
  });

  if (validRounds.length < 3) {
    return "Provisional";
  }

  const totalStrokes = validRounds.reduce((acc, round) => {
    return (
      acc +
      parseFloat(round.gross_score || round.gross_total || round.total_score)
    );
  }, 0);

  const rawAverage = totalStrokes / validRounds.length;
  const rawHandicap = rawAverage - coursePar;

  // 🧮 OPTION B: STANDARD MATHEMATICAL ROUNDING TO THE TENTHS
  const roundedValue = Math.round(rawHandicap * 10) / 10;
  return roundedValue.toFixed(1);
}

/**
 * GET /handicaps
 * Main dashboard data router orchestrator
 */
export async function getHandicapsDashboard(req, res) {
  try {
    let { year, weekId } = req.query;

    // 1. Fetch metadata dropdown configuration arrays (includes active roster members)
    const meta = await getHandicapFilterMetadata();

    // 🟢 FIXED ARRAY ACCESSIBILITY: Pulls the first string item node out cleanly
    if (!year && meta && meta.years && meta.years.length > 0) {
      year = meta.years[0]; // Resolves cleanly to a string token like "2026"
    } else if (!year) {
      year = "2026";
    }

    // Force full year dataset down so local memory has historical items to count 3+ rounds
    const completeYearlyData = await getFilteredHandicapHistory({
      year,
      weekId: "",
      memberId: "",
    });

    // 2. Group all historical rounds cleanly by player ID
    const playerHistoryMap = {};
    if (completeYearlyData && completeYearlyData.length > 0) {
      completeYearlyData.forEach((row) => {
        const mId = row.member_id || row.memberId || row.id || row.player_id;
        if (!mId) return;
        if (!playerHistoryMap[mId]) {
          playerHistoryMap[mId] = [];
        }
        playerHistoryMap[mId].push(row);
      });
    }

    // Determine target selection week context parameters
    // 🟢 FIXED STRING ASSIGNMENT FOR DEFAULT FIELD WEEK:
    const targetWeek =
      weekId ||
      (meta && meta.weeks && meta.weeks.length > 0 ? meta.weeks[0] : "");
    if (!weekId) weekId = targetWeek;
    const currentCheckWeek = parseInt(targetWeek, 10);

    let finalFilteredViewRows = [];

    // =================================================================
    // 🎯 INDIVIDUAL SINGLE PLAYER TRACKING VIEW MODE
    // =================================================================
    if (req.query.memberId && req.query.memberId !== "") {
      const targetMemberId = String(req.query.memberId);

      const masterRows = completeYearlyData.filter(
        (row) => String(row.member_id || row.id) === targetMemberId,
      );

      finalFilteredViewRows = masterRows.map((row) => {
        const mId = row.member_id || row.id;
        const playerAllRounds = playerHistoryMap[mId] || [];
        const loopRoundWeek = parseInt(row.week_id || row.week_number, 10);

        const roundsUpToThisPoint = playerAllRounds.filter((round) => {
          const rWeek = parseInt(round.week_id || round.week_number, 10);
          return rWeek <= loopRoundWeek;
        });

        return {
          ...row,
          member_id: mId,
          week_id: row.week_id || row.week_number,
          week_number: row.week_number || row.week_id,
          name_first: row.name_first || "",
          name_last: row.name_last || "",
          calculated_handicap: computeCumulativeHandicap(roundsUpToThisPoint),
        };
      });

      finalFilteredViewRows.sort(
        (a, b) =>
          (parseInt(a.week_number, 10) || 0) -
          (parseInt(b.week_number, 10) || 0),
      );

      // =================================================================
      // 🚀 THE COMPLETE FIELD LEADERBOARD FIX: (RUNS WHEN VIEWING A WEEK)
      // =================================================================
    } else {
      // Loop over every active league player option inside your pre-filtered metadata dropdown matrix!
      // This guarantees that 100% of your roster is evaluated, even if they skipped this week.
      finalFilteredViewRows = meta.members.map((member) => {
        const mId = member.id;
        const playerAllRounds = playerHistoryMap[mId] || [];

        // Isolate rounds turned in *up to and including* the selected lookback week
        const roundsUpToThisPoint = playerAllRounds.filter((round) => {
          const loopRoundWeek = parseInt(
            round.week_id || round.week_number,
            10,
          );
          return (
            !isNaN(loopRoundWeek) &&
            !isNaN(currentCheckWeek) &&
            loopRoundWeek <= currentCheckWeek
          );
        });

        // Reconstruct a standard layout record block row that handicap-history.ejs expects
        return {
          member_id: mId,
          week_id: weekId,
          week_number: weekId,
          name_first: member.name_first || "",
          name_last: member.name_last || "",
          status: member.status || "Yes",
          is_non_member: member.is_non_member || 0,
          calculated_handicap: computeCumulativeHandicap(roundsUpToThisPoint), // 🧮 Compares historical cards up to this week
          total_rounds_played: roundsUpToThisPoint.filter((r) => {
            const gross = parseFloat(
              r.gross_score || r.gross_total || r.total_score,
            );
            return !isNaN(gross) && gross > 0;
          }).length,
        };
      });

      // Sort by Handicap value High to Low for leaderboard listings view layouts
      finalFilteredViewRows.sort((a, b) => {
        if (a.calculated_handicap === "Provisional") return 1;
        if (b.calculated_handicap === "Provisional") return -1;
        return (
          parseFloat(b.calculated_handicap) - parseFloat(a.calculated_handicap)
        );
      });
    }

    // 3. Render the localized parameter views payload
    res.render("handicap-history", {
      history: finalFilteredViewRows,
      filters: meta,
      selectedYear: year || "",
      selectedWeek: weekId || "",
      selectedMember: req.query.memberId || "",
      weekDate: {
        displayDate: req.query.memberId
          ? "Individual Player History Chart"
          : `Bottoms Up Golf League • Week ${weekId || "All"} Summary`,
      },
    });
  } catch (error) {
    console.error("CRITICAL HANDICAP CONTROLLER RUNTIME ERROR:", error);
    res.status(500).send("Error compiling dashboard datasets.");
  }
}
