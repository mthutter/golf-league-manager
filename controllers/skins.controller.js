import * as skinsService from "../services/skins.service.js";

/**
 * POST /skins/calculate/:weekId
 */
export const calculateSkinsApi = async (req, res) => {
  try {
    const { weekId } = req.params;
    if (!weekId) {
      return res.status(400).json({ error: "Missing weekId parameter." });
    }

    // Call service to run calculation engine
    const results = await skinsService.runSkinsCalculation(Number(weekId));

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
    // Get summary of all weeks available
    const weeks = await skinsService.getWeeksSummary();

    // Choose selected week or fallback to the latest one
    const selectedWeekId = req.query.weekId
      ? Number(req.query.query.weekId)
      : weeks[0]?.week_id || null;

    // Fetch report statistics from the service
    const reportData = await skinsService.buildSkinsReport(selectedWeekId);

    res.render("skins-report", {
      weeks,
      selectedWeekId,
      ...reportData,
    });
  } catch (error) {
    console.error("Skins Report Route Error:", error);
    res.status(500).send("Internal Server Error");
  }
};
