import * as skinsService from "../services/skins.service.js";
import * as weeksService from "../services/weeks.service.js";
/**
 * POST /skins/calculate/:weekId
 */
export const calculateSkinsApi = async (req, res) => {
  try {
    const { weekId } = req.params;

    if (!weekId) {
      return res.status(400).json({
        error: "Missing weekId parameter.",
      });
    }

    console.log("calculateSkinsApi fired");

    const results = await skinsService.calculateAndSaveSkins(Number(weekId));

    console.log(`[SKINS] Week ${weekId} calculated successfully`);

    return res.status(200).json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("Skins calculation route error:", error);

    return res.status(500).json({
      error: error.message,
    });
  }
};

/**
 * GET /skins
 */
export const getSkinsReport = async (req, res) => {
  try {
    const weeks = await skinsService.getWeeksSummary();

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

    const baseReportData = await skinsService.buildSkinsReport(selectedWeekId);
    const week = await weeksService.getWeek(selectedWeekId);

    console.log("week before render:", week);

    res.render("skins-report", {
      weeks: weeks || [],
      selectedWeekId,
      week,
      totalPot: baseReportData?.totalPot || 0,
      participantScores: baseReportData?.participantScores || [],
      leaderboard: baseReportData?.leaderboard || [],
      holeDetails: baseReportData?.holeDetails || [],
      holeInfo: baseReportData?.holeInfo || [],
      reportTotals: baseReportData?.reportTotals || {
        skins: 0,
        payout: 0,
      },
    });
  } catch (error) {
    console.error("Skins Report Route Error:", error);
    res.status(500).send("Internal Server Error");
  }
};
