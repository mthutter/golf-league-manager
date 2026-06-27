import {
  getGroupingsForWeek,
  generateRandomGroupings,
  swapPlayerPositions,
} from "../services/grouping.service.js";

import {
  getAllWeeks,
  getWeek,
  getUpcomingWeek,
  formatDateTime,
} from "../services/weeks.service.js";

/**
 * GET /tee-times?week=1
 * Renders the tee times page for a specific week.
 */
export const showTeeTimes = async (req, res) => {
  try {
    let weekId = Number(req.query.week);

    if (!weekId) {
      const upcomingWeek = await getUpcomingWeek();
      weekId = upcomingWeek.week_number;
    }
    // Extended to match your complete 22-week league season calendar
    const weeks = await getAllWeeks();
    const currentWeek = await getWeek(weekId);

    // Destructure the groupings array and outPlayers array from the service
    const { groupings, outPlayers, subPlayers, lastUpdated } =
      await getGroupingsForWeek(weekId);

    const formattedLastUpdated = formatDateTime(lastUpdated);

    res.render("tee-times", {
      groupings,
      outPlayers,
      subPlayers,
      lastUpdated: formattedLastUpdated,
      currentWeek,
      weeks,
      weekId,
    });
  } catch (err) {
    console.error("Error in showTeeTimes controller:", err);
    res.status(500).send("Unable to load tee times.");
  }
};

/**
 * POST /tee-times/generate/:weekId
 * Generates random groups for the week and redirects back to the viewer.
 */
export const generateGroupings = async (req, res) => {
  try {
    const weekId = Number(req.params.weekId);

    if (isNaN(weekId)) {
      return res.status(400).send("Invalid week ID provided.");
    }

    await generateRandomGroupings(weekId);

    // Redirect back to the view page for this specific week
    res.redirect(`/tee-times?week=${weekId}`);
  } catch (err) {
    console.error("Error in generateGroupings controller:", err);
    res.status(500).send("Unable to generate groupings.");
  }
};

/**
 * PUT /groupings/swap
 * Handles shifting player positions via Drag & Drop interface payloads.
 */
export const swapPlayers = async (req, res) => {
  try {
    // 1. Enforce admin backend security session rules
    if (!req.session || !req.session.isAdmin) {
      return res
        .status(403)
        .json({ success: false, error: "Admin authentication required." });
    }

    const { weekId, player1, player2 } = req.body;

    if (!weekId || !player1 || !player2) {
      return res
        .status(400)
        .json({ success: false, error: "Missing required swap parameters." });
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

    // 3. Execute the transactional SQLite update query block
    await swapPlayerPositions(targetWeek, p1, p2);

    return res.json({
      success: true,
      message: "Positions swapped successfully!",
    });
  } catch (err) {
    console.error("Error in swapPlayers controller:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
