import { Router } from "express";
import { getFilteredHandicapHistory, getHandicapFilterMetadata } from "../services/handicap.service.js";
import { getCurrentWeekPlayed } from "../services/weeks.service.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    let { year, weekId, memberId } = req.query;

    // Fetch metadata dropdown arrays
    const meta = await getHandicapFilterMetadata();

    // 1. FIXED: Extract the first scalar value out of the arrays rather than the entire array object
    if (!year && meta.years.length > 0) {
      year = meta.years[0]; // Selects the latest year, e.g., "2026"
    }

    if (!weekId && !memberId) {
      const currentWeekObj = await getCurrentWeekPlayed();
      weekId = currentWeekObj && typeof currentWeekObj === "object" ? currentWeekObj.week_number : currentWeekObj;

      // 2. FIXED: Select the first index fallback week
      if (!weekId && meta.weeks.length > 0) {
        weekId = meta.weeks[0];
      }
    }

    // Run the dynamic filter engine query
    const historyData = await getFilteredHandicapHistory({ year, weekId, memberId });

    res.render("handicap-history", {
      history: historyData,
      filters: meta,
      selectedYear: year || "",
      selectedWeek: weekId || "",
      selectedMember: memberId || "",
      weekDate: {
        displayDate: memberId ? "Individual Player History Chart" : "Bottoms Up Golf League • 2026 Season",
      },
    });
  } catch (error) {
    // 3. ENHANCEMENT: Log the real root cause message to your console so you can see exact database failures!
    console.error("CRITICAL HANDICAP ROUTE REASON FOR CRASH:", error);
    res.status(500).send(`Error compiling dashboard datasets: ${error.message}`);
  }
});

export default router;
