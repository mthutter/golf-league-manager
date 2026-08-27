// controllers/handicap.controller.js
import { getFilteredHandicapHistory, getHandicapFilterMetadata } from "../services/handicap.service.js";
import { getCurrentWeekPlayed } from "../services/weeks.service.js";

/**
 * Compute the 100% cumulative handicap index using Option B (Standard Mathematical Rounding)
 * Evaluates raw scores against a 9-hole base par of 36.
 */
function computeCumulativeHandicap(allRounds, coursePar = 36) {
  const validRounds = allRounds.filter((round) => {
    const gross = parseFloat(round.gross_score || round.gross_total || round.total_score);
    return !isNaN(gross) && gross > 0;
  });

  if (validRounds.length < 3) {
    return "Provisional";
  }

  const totalStrokes = validRounds.reduce((acc, round) => {
    return acc + parseFloat(round.gross_score || round.gross_total || round.total_score);
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

    // 1. Fetch metadata dropdown configuration arrays
    const meta = await getHandicapFilterMetadata();

    // 2. 🟢 FIXED CRASH SCALAR ASSIGNMENT: Pulls the first item string out of the array layout
    if (!year && meta && meta.years && meta.years.length > 0) {
      year = meta.years[0]; // Resolves cleanly to a string token like "2026"
    } else if (!year) {
      year = "2026"; // Complete hard fallback protection
    }

    // Force full year dataset down so local memory has historical items to count 3+ rounds
    const completeYearlyData = await getFilteredHandicapHistory({ year, weekId: "", memberId: "" });

    // PROPERTY SAFETIES: Group rows securely checking all possible database variable styles
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

    const historyWithCalculatedHandicaps = completeYearlyData.map((row) => {
      const mId = row.member_id || row.memberId || row.id || row.player_id;
      const playerAllRounds = playerHistoryMap[mId] || [];
      const currentCheckWeek = parseInt(row.week_id || row.week_number, 10);

      const roundsUpToThisPoint = playerAllRounds.filter((round) => {
        const loopRoundWeek = parseInt(round.week_id || round.week_number, 10);
        return !isNaN(loopRoundWeek) && !isNaN(currentCheckWeek) && loopRoundWeek <= currentCheckWeek;
      });

      return {
        ...row,
        member_id: mId,
        week_id: row.week_id || row.week_number,
        week_number: row.week_number || row.week_id,
        name_first: row.name_first || "",
        name_last: row.name_last || "",
        calculated_handicap: computeCumulativeHandicap(roundsUpToThisPoint),
        total_rounds_played: roundsUpToThisPoint.filter((r) => {
          const gross = parseFloat(r.gross_score || r.gross_total || r.total_score);
          return !isNaN(gross) && gross > 0;
        }).length,
      };
    });

    let finalFilteredViewRows = historyWithCalculatedHandicaps;

    // Type-Agnostic check for individual member lookups using req.query directly
    if (req.query.memberId && req.query.memberId !== "") {
      finalFilteredViewRows = historyWithCalculatedHandicaps.filter((row) => String(row.member_id) === String(req.query.memberId));

      // FORCE CHRONOLOGICAL SORT: Week 1 down to Week XX top down
      finalFilteredViewRows.sort((a, b) => {
        const wkA = parseInt(a.week_number || a.week_id, 10) || 0;
        const wkB = parseInt(b.week_number || b.week_id, 10) || 0;
        return wkA - wkB;
      });
    } else {
      // 🟢 WEEKLY FIELD LEADERBOARD VIEW
      const targetWeek = weekId || (meta && meta.weeks && meta.weeks.length > 0 ? meta.weeks[0] : "");

      // Update selected week tracking state to preserve interface menu configurations cleanly
      if (!weekId) weekId = targetWeek;

      if (targetWeek && targetWeek !== "") {
        finalFilteredViewRows = historyWithCalculatedHandicaps.filter((row) => String(row.week_id || row.week_number) === String(targetWeek));
      }

      // Sort by Handicap value High to Low for leaderboard standings
      finalFilteredViewRows.sort((a, b) => {
        if (a.calculated_handicap === "Provisional") return 1;
        if (b.calculated_handicap === "Provisional") return -1;
        return parseFloat(b.calculated_handicap) - parseFloat(a.calculated_handicap);
      });
    }

    res.render("handicap-history", {
      history: finalFilteredViewRows,
      filters: meta,
      selectedYear: year || "",
      selectedWeek: weekId || "",
      selectedMember: req.query.memberId || "",
      weekDate: {
        displayDate: req.query.memberId ? "Individual Player History Chart" : `Bottoms Up Golf League • Week ${weekId || "All"} Summary`,
      },
    });
  } catch (error) {
    console.error("CRITICAL HANDICAP CONTROLLER RUNTIME ERROR:", error);
    res.status(500).send("Error compiling dashboard datasets.");
  }
}
