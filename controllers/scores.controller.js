import * as scoresService from "../services/scores.service.js";
import * as weeksService from "../services/weeks.service.js";
import logger from "../utilities/logger.js";
import { catchAsync } from "../utilities/asyncHandler.js";
import posthog from "../utilities/posthog.js";

/**
 * GET /scores/new
 */
export const getNewScoresForm = catchAsync(async (req, res, next) => {
  logger.info(
    { sessionId: req.session?.id },
    "Loading metadata configuration parameters for the weekly score entry form",
  );

  const { members, holes } = await scoresService.getFormData();

  return res.render("weekly-scores-form", { members, holes });
});

/**
 * POST /scores/save
 */
export const saveScore = catchAsync(async (req, res, next) => {
  const { memberId, weekId } = req.body;

  logger.info(
    { memberId, weekId },
    "Processing new league score entry record submission",
  );

  try {
    await scoresService.createScoreRecord(req.body);
    logger.info(
      { memberId, weekId },
      "Player performance metrics saved successfully",
    );
    posthog.capture({
      distinctId: req.session?.id || "anonymous",
      event: "score_saved",
      properties: { member_id: memberId, week_id: weekId },
    });
    return res.redirect("/scores/new");
  } catch (err) {
    // Safely isolate and intercept expected duplicate entry constraints
    if (err.message.includes("UNIQUE")) {
      logger.warn(
        { memberId, weekId },
        "Score card entry rejected: Unique database index conflict",
      );
      return res
        .status(400)
        .send("Scores already entered for this player/week.");
    }
    // Forward unexpected errors (like disk lock or network timeout) to centralized handler
    throw err;
  }
});

/**
 * GET /scores/standings
 */
export const getStandings = catchAsync(async (req, res, next) => {
  logger.info(
    "Computing global season point totals and league handicaps for standings table",
  );

  const selectedWeek = Number(req.query.week) || null;

  const data = await scoresService.getSeasonStandings(selectedWeek);

  return res.render("standings", data);
});
/**
 * GET /scores/weekly/:weekId
 */
export const getWeeklyScores = catchAsync(async (req, res, next) => {
  const weekId = req.params.weekId;

  logger.info(
    { weekId },
    "Aggregating individual stroke scores and points for week breakdown",
  );

  const results = await scoresService.getWeeklyBreakdown(weekId);
  const weekDate = await weeksService.getWeek(weekId);

  return res.render("weekly", { weekId, results, weekDate });
});

/**
 * GET /scores/player/:id
 */
export const getMemberProfile = catchAsync(async (req, res, next) => {
  const memberId = parseInt(req.params.id, 10);

  logger.info({ memberId }, "Assembling historical player scorecard profiles");

  const profileData = await scoresService.getMemberProfileData(memberId);

  if (!profileData) {
    logger.warn(
      { memberId },
      "Target member identification record does not exist",
    );
    res.status(404);
    return res.render("404"); // Fall back to your custom 404 template safely
  }

  return res.render("profile", profileData);
});

/**
 * Legacy redirect wrapper handler
 */
export const getScoresLegacy = catchAsync(async (req, res, next) => {
  logger.info(
    "Rerouting legacy leaderboard endpoint request to standard standings layout",
  );
  return res.redirect("/scores/standings");
});

export const getRoundDetails = async (req, res, next) => {
  try {
    const scoreId = Number(req.params.scoreId);

    const round = await scoresService.getRoundDetails(scoreId);

    if (!round) {
      req.flash("error", "Round not found.");
      return res.redirect("/players");
    }

    res.render("round-details", {
      title: "Scorecard",
      round,
    });
  } catch (err) {
    next(err);
  }
};
