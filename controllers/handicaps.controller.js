import { Router } from "express"; // or import Router from "router" based on your project requirements
import { getFilteredHandicapHistory, getHandicapFilterMetadata } from "../services/handicap.service.js";
import { getCurrentWeekPlayed } from "../services/weeks.service.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    let { year, weekId, memberId } = req.query;

    const meta = await getHandicapFilterMetadata();

    // Fallback strategy if page is loaded fresh
    if (!year && meta.years.length > 0) year = meta.years[0];
    if (!weekId && !memberId) {
      const currentWeekObj = await getCurrentWeekPlayed();
      weekId = currentWeekObj && typeof currentWeekObj === "object" ? currentWeekObj.week_number : currentWeekObj;
      if (!weekId && meta.weeks.length > 0) weekId = meta.weeks[0];
    }

    const historyData = await getFilteredHandicapHistory({ year, weekId, memberId });

    // Targets 'handicap-history.ejs' cleanly
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
    res.status(500).send("Error compiling dashboard datasets.");
  }
});

export default router;
