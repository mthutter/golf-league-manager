import * as skinsService from "../services/skins.service.js";
import * as weeksService from "../services/weeks.service.js";
import logger from "../utilities/logger.js";
import { catchAsync } from "../utilities/asyncHandler.js";
import posthog from "../utilities/posthog.js";

/**
 * POST /skins/calculate/:weekId
 */
export const calculateSkinsApi = catchAsync(async (req, res, next) => {
  const { weekId } = req.params;

  if (!weekId) {
    logger.warn({ selectedWeekId }, "Skins calculation API rejected: Missing weekId parameter");
    return res.status(400).json({
      error: "Missing weekId parameter.",
    });
  }

  logger.info("Executing skins matrix algorithm for target week");
  const results = await skinsService.calculateAndSaveSkins(Number(weekId));

  logger.info({ weekId: Number(weekId) }, "Skins metrics calculated and saved to cache successfully");
  posthog.capture({
    distinctId: req.session?.id || "anonymous",
    event: "skins_calculated",
    properties: { week_id: Number(weekId) },
  });
  return res.status(200).json({
    success: true,
    results,
  });
});

/**
 * GET /skins
 */
export const getSkinsReport = catchAsync(async (req, res, next) => {
  logger.info("Assembling global skins payout dashboard summary data");

  const weeks = await weeksService.getAllWeeks();
  if (!req.query.weekId && weeks.length > 0) {
    return res.redirect(`/skins?weekId=${weeks[0].week_number}`);
  }

  const selectedWeekId = req.query.weekId ? Number(req.query.weekId) : weeks[0]?.week_id || null;

  if (!selectedWeekId) {
    logger.info("No active week selection found. Rendering fallback empty leaderboard display.");
    return res.render("skins", {
      weeks: weeks || [],
      selectedWeekId: null,
      totalPot: 0,
      participantScores: [],
      leaderboard: [],
      holeDetails: [],
    });
  }

  logger.info({ selectedWeekId }, "Gathering score sheets and payouts for selected week context");

  // Call services concurrently to accelerate execution times
  const [baseReportData, week, currentWeek] = await Promise.all([
    skinsService.buildSkinsReport(selectedWeekId),
    weeksService.getWeek(selectedWeekId),
    weeksService.getCurrentWeek(),
  ]);

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
