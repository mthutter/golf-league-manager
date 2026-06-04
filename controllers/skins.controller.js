import * as skinsService from "../services/skins.service.js";
// ✨ FIX: Import your admin service file where processSkinsForWeek is defined
import * as adminService from "../services/admin.service.js";

/**
 * POST /skins/calculate/:weekId
 */
export const calculateSkinsApi = async (req, res) => {
  try {
    const { weekId } = req.params;
    if (!weekId) {
      return res.status(400).json({ error: "Missing weekId parameter." });
    }

    // Call service to run calculation engine from admin service
    const results = await adminService.processSkinsForWeek(Number(weekId));
    return res.status(200).json({ message: "Success", data: results });
  } catch (error) {
    console.error("Skins calculation route error:", error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * GET /skins
 */
export const getSkinsReport = async (req, res) => {
  try {
    // 1. Get summary of all tournament weeks available
    const weeks = await skinsService.getWeeksSummary();

    // 2. Determine selected week ID
    const selectedWeekId = req.query.weekId
      ? Number(req.query.weekId)
      : weeks[0]?.week_id || null;

    if (!selectedWeekId) {
      return res.render("skins-report", {
        weeks: weeks || [],
        selectedWeekId: null,
        totalPot: 0,
        participantScores: [],
        leaderboard: [],
        holeDetails: [],
      });
    }

    // 3. Fetch base stats and participant score matrix details from your main service
    const baseReportData = await skinsService.buildSkinsReport(selectedWeekId);

    // 4. ✨ FIX: Call the function from adminService instead of skinsService
    const computedSkins =
      await adminService.processSkinsForWeek(selectedWeekId);

    // 5. Render your EJS view, feeding the exact structured arrays it expects
    res.render("skins-report", {
      weeks: weeks || [],
      selectedWeekId,
      totalPot: baseReportData?.totalPot || computedSkins?.totalPot || 0,
      participantScores: baseReportData?.participantScores || [],
      leaderboard: computedSkins?.leaderboard || [],
      holeDetails: computedSkins?.holeDetails || [],
    });
  } catch (error) {
    console.error("Skins Report Route Error:", error);
    res.status(500).send("Internal Server Error");
  }
};
