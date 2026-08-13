import * as skinsService from "../services/skins.service.js";
import * as weeksService from "../services/weeks.service.js";
import logger from "../utilities/logger.js";
import { catchAsync } from "../utilities/asyncHandler.js";
import posthog from "../utilities/posthog.js";

/**
 * POST /skins/calculate/:weekId
 */
export const calculateSkinsApi = catchAsync(async (req, res) => {
  const { weekId } = req.params;
  if (!weekId) {
    logger.warn("Skins calculation API rejected: Missing weekId parameter");
    return res.status(400).json({ error: "Missing weekId parameter." });
  }

  logger.info("Executing skins matrix algorithm for target week");
  const results = await skinsService.calculateAndSaveSkins(Number(weekId));
  logger.info("Skins metrics calculated and saved to cache successfully");

  posthog.capture({
    distinctId: req.session?.id || "anonymous",
    event: "skins_calculated",
    properties: { week_id: Number(weekId) },
  });

  return res.status(200).json({ success: true, results });
});

/**
 * GET /skins
 */
export const getSkinsReport = catchAsync(async (req, res) => {
  logger.info("Assembling global skins payout dashboard summary data");

  const [weeks, currentWeek] = await Promise.all([weeksService.getAllWeeks(), weeksService.getCurrentWeek()]);

  // FIXED: If no weekId is in the URL query string, redirect to the current live week context
  if (!req.query.weekId) {
    const defaultWeekNumber = currentWeek?.week_number || (weeks.length > 0 ? weeks[0].week_number : null);
    if (defaultWeekNumber) {
      return res.redirect(`/skins?weekId=${defaultWeekNumber}`);
    }
  }

  const selectedWeekId = req.query.weekId ? Number(req.query.weekId) : currentWeek?.week_number || null;

  if (!selectedWeekId) {
    logger.info("No active week selection found. Rendering fallback empty leaderboard display.");
    return res.render("skins", {
      weeks: weeks || [],
      selectedWeekId: null,
      totalPot: 0,
      participantScores: [],
      leaderboard: [],
      holeDetails: [],
      reportTotals: { skins: 0, payout: 0 },
    });
  }

  logger.info({ selectedWeekId }, "Gathering score sheets and payouts for selected week context");

  // Call remaining services concurrently to accelerate execution times
  const [baseReportData, week] = await Promise.all([skinsService.buildSkinsReport(selectedWeekId), weeksService.getWeek(selectedWeekId)]);

  return res.render("skins", {
    weeks: weeks || [],
    selectedWeekId,
    week,
    currentWeek,
    totalPot: baseReportData?.totalPot || 0,
    participantScores: baseReportData?.participantScores || [],
    leaderboard: baseReportData?.leaderboard || [],
    holeDetails: baseReportData?.holeDetails || [],
    holeInfo: baseReportData?.holeInfo || [],
    reportTotals: baseReportData?.reportTotals || { skins: 0, payout: 0 },
  });
});
