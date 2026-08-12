import { getFilteredHandicapHistory, getHandicapFilterMetadata } from "./services/handicap.service.js";
import { getCurrentWeekPlayed } from "./services/weeks.service.js";

app.get("/handicaps", async (req, res) => {
  try {
    // Fetch values from the dropdown form submissions
    let { year, weekId, memberId } = req.query;

    // 1. Fetch metadata menus lists
    const meta = await getHandicapFilterMetadata();

    // 2. Default fallback strategy if page is loaded fresh without filters
    if (!year && meta.years.length > 0) year = meta.years[0] || "2026";
    if (!weekId && !memberId) {
      const currentWeekObj = await getCurrentWeekPlayed();
      weekId = currentWeekObj && typeof currentWeekObj === "object" ? currentWeekObj.week_number : currentWeekObj;
      if (!weekId && meta.weeks.length > 0) weekId = meta.weeks[0];
    }

    // 3. Extract the active rows matching the selected values
    const historyData = await getFilteredHandicapHistory({ year, weekId, memberId });

    res.render("weekly", {
      history: historyData,
      filters: meta,
      selectedYear: year || "",
      selectedWeek: weekId || "",
      selectedMember: memberId || "",
    });
  } catch (error) {
    res.status(500).send("Error compiling dashboard datasets.");
  }
});
