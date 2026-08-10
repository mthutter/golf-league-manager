import { getGroupingsForWeek, generateRandomGroupings, swapPlayerPositions } from "../services/grouping.service.js";
import { getAllWeeks, getWeek, getUpcomingWeek, formatDateTime } from "../services/weeks.service.js";
import logger from "../utilities/logger.js";
import { catchAsync } from "../utilities/asyncHandler.js";
import posthog from "../utilities/posthog.js";

/**
 * GET /tee-times?week=1
 * Renders the tee times page for a specific week.
 */
export const showTeeTimes = catchAsync(async (req, res, next) => {
  let weekId = Number(req.query.week);

  if (!weekId) {
    const upcomingWeek = await getUpcomingWeek();
    weekId = upcomingWeek.week_number;
  }

  logger.info("Fetching league pairings and tee times");

  // Extended to match your complete 22-week league season calendar
  const weeks = await getAllWeeks();
  const currentWeek = await getWeek(weekId);

  // Destructure the groupings array and outPlayers array from the service
  const { groupings, outPlayers, subPlayers, lastUpdated } = await getGroupingsForWeek(weekId);
  const formattedLastUpdated = formatDateTime(lastUpdated);

  return res.render("tee-times", {
    groupings,
    outPlayers,
    subPlayers,
    lastUpdated: formattedLastUpdated,
    currentWeek,
    weeks,
    weekId,
  });
});

/**
 * POST /tee-times/generate/:weekId
 * Generates random groups for the week and redirects back to the viewer.
 */
export const generateGroupings = catchAsync(async (req, res, next) => {
  const weekId = Number(req.params.weekId);

  if (isNaN(weekId)) {
    logger.warn({ rawParam: req.params.weekId }, "Rejected grouping generation: Invalid week ID input");
    return res.status(400).send("Invalid week ID provided.");
  }

  logger.info("Triggering automatic grouping generation engine");
  await generateRandomGroupings(weekId);

  posthog.capture({
    distinctId: req.user?.id || req.sessionID,
    event: "groupings_generated",
    properties: { week_id: weekId },
  });

  // Redirect back to the view page for this specific week
  return res.redirect(`/tee-times?week=${weekId}`);
});

/**
 * PUT /groupings/swap
 * Handles shifting player positions via Drag & Drop interface payloads.
 */
export const swapPlayers = catchAsync(async (req, res, next) => {
  const { weekId, player1, player2 } = req.body;

  if (!weekId || !player1 || !player2) {
    logger.warn({ hasWeekId: !!weekId, hasP1: !!player1, hasP2: !!player2 }, "Player position swap validation rejected: Missing payload fields");
    return res.status(400).json({
      success: false,
      error: "Missing required swap parameters.",
    });
  }

  // 2. Parse incoming payload properties safely into numbers
  const targetWeek = Number(weekId);
  const p1 = {
    memberId: Number(player1.memberId),
    groupNumber: player1.groupNumber ? Number(player1.groupNumber) : null,
    position: player1.position ? Number(player1.position) : null,
  };
  const p2 = {
    memberId: Number(player2.memberId),
    groupNumber: player2.groupNumber ? Number(player2.groupNumber) : null,
    position: player2.position ? Number(player2.position) : null,
  };

  logger.info("Executing database player position swap transaction");

  // 3. Execute the transactional SQLite update query block
  await swapPlayerPositions(targetWeek, p1, p2);

  posthog.capture({
    distinctId: req.session?.id || "anonymous",
    event: "players_swapped",
    properties: {
      week_id: targetWeek,
      player1_id: p1.memberId,
      player2_id: p2.memberId,
    },
  });

  return res.json({
    success: true,
    message: "Positions swapped successfully!",
  });
});
