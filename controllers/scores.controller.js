import * as scoresService from "../services/scores.service.js";
import * as weeksService from "../services/weeks.service.js";
import logger from "../utilities/logger.js";
import { catchAsync } from "../utilities/asyncHandler.js";
import posthog from "../utilities/posthog.js";

/**
 * GET /scores/new
 */
export const getNewScoresForm = catchAsync(async (req, res) => {
  logger.info("Loading metadata configuration parameters for the weekly score entry form");
  // 1. Fetch raw data from the scores service
  const { members, holes } = await scoresService.getFormData();
  // 2. Filter the members list to remove inactive players (status = 'NO')
  const activeMembers = Array.isArray(members) ? members.filter((member) => member.status !== "No") : [];
  // 3. Render the form with only active league members
  return res.render("weekly-scores-form", {
    members: activeMembers,
    holes,
  });
});

/**
 * POST /scores/save
 */
export const saveScore = catchAsync(async (req, res) => {
  const { memberId, weekId } = req.body;
  logger.info("Processing new league score entry record submission");
  try {
    await scoresService.createScoreRecord(req.body);
    logger.info("Player performance metrics saved successfully");
    posthog.capture({
      distinctId: req.session?.id || "anonymous",
      event: "score_saved",
      properties: {
        member_id: memberId,
        week_id: weekId,
      },
    });
    return res.redirect("/scores/new");
  } catch (err) {
    // Safely isolate and intercept expected duplicate entry constraints
    if (err.message.includes("UNIQUE")) {
      logger.warn(
        {
          memberId,
          weekId,
        },
        "Score card entry rejected: Unique database index conflict",
      );
      return res.status(400).send("Scores already entered for this player/week.");
    }
    // Forward unexpected errors (like disk lock or network timeout) to centralized handler
    throw err;
  }
});

/**
 * GET /scores/standings
 */
export const getStandings = catchAsync(async (req, res) => {
  logger.info("Computing global season point totals and league handicaps for standings table");
  const selectedWeek = Number(req.query.week) || null;
  const data = await scoresService.getSeasonStandings(selectedWeek);
  return res.render("standings", data);
});

/**
 * GET /scores/weekly/:weekId
 */
export const getWeeklyScores = catchAsync(async (req, res) => {
  const weekId = req.params.weekId;
  logger.info("Aggregating individual stroke scores and points for week breakdown");
  const results = await scoresService.getWeeklyBreakdown(weekId);
  const weekDate = await weeksService.getWeek(weekId);
  return res.render("weekly", {
    weekId,
    results,
    weekDate,
  });
});

/**
 * GET /scores/player/:id
 */
export const getMemberProfile = catchAsync(async (req, res) => {
  const memberId = parseInt(req.params.id, 10);
  logger.info("Assembling historical player scorecard profiles");
  const profileData = await scoresService.getMemberProfileData(memberId);
  if (!profileData) {
    logger.warn(
      {
        memberId,
      },
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
export const getScoresLegacy = catchAsync(async (req, res) => {
  logger.info("Rerouting legacy leaderboard endpoint request to standard standings layout");
  return res.redirect("/scores/standings");
});

export const getRoundDetails = catchAsync(async (req, res) => {
  const scoreId = Number(req.params.scoreId);
  logger.info({ scoreId }, "Fetching detailed scorecard configuration metrics");

  const round = await scoresService.getRoundDetails(scoreId);

  if (!round) {
    req.flash("error", "Round not found.");
    return res.redirect("/players");
  }

  // 🟢 THE RESOLUTION: Spread the object elements explicitly into the render scope!
  // This makes variables like 'holes', 'player_name', and 'net_total'
  // directly readable on the root level, satisfying your original EJS layout templates instantly.
  res.render("round-details", {
    title: "Scorecard",
    round, // Kept for safety if any lines do reference round.*
    ...round, // 🚀 Spreads holes, player_name, week_id, etc. onto the root template scope!
  });
});

/** =========================================================================
 *  NEW MODIFY / EDIT CONTROLLERS
 *  ========================================================================= */

/**
 * GET /scores/edit/:scoreId
 * Pulls an existing round's score metadata and passes it to the modification form
 */
export const getModifyScoresForm = catchAsync(async (req, res) => {
  const scoreId = Number(req.params.scoreId);
  logger.info(
    {
      scoreId,
    },
    "Fetching existing round record data for modification form rendering",
  );

  // Fetch the single scorecard record and the course layout configuration
  const scoreRecord = await scoresService.getRoundDetails(scoreId);
  const { holes } = await scoresService.getFormData();

  if (!scoreRecord) {
    logger.warn(
      {
        scoreId,
      },
      "Failed to find requested scorecard record for modification",
    );
    res.status(404);
    return res.render("404");
  }

  // Render the modification view with the loaded datasets
  return res.render("weekly-scores-modify-form", {
    scoreRecord,
    holes,
  });
});

/**
 * POST /scores/update/:scoreId
 * Processes edits to a user scorecard, recalculates data pools, and persists update records
 */
export const updateScore = catchAsync(async (req, res) => {
  const scoreId = Number(req.params.scoreId);
  const { memberId, weekId } = req.body;
  logger.info(
    {
      scoreId,
    },
    "Processing updates for scorecard modification request payload",
  );

  await scoresService.updateScoreRecord(scoreId, req.body);
  logger.info(
    {
      scoreId,
    },
    "Scorecard metrics modified and updated safely in database",
  );

  posthog.capture({
    distinctId: req.session?.id || "anonymous",
    event: "score_modified",
    properties: {
      score_id: scoreId,
      member_id: memberId,
      week_id: weekId,
    },
  });

  // Send the manager back to the weekly breakdown matrix view they came from
  return res.redirect(`/scores/weekly/${weekId}`);
});
