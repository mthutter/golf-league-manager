import express from "express";
import { calculateSkins } from "../services/skins.service.js"; // Verify this path matches your files
import { all } from "../config/db.js";

const router = express.Router();

// 1. THIS IS THE MISSING LINK! Make sure this exact POST route exists:
router.post("/calculate/:weekId", async (req, res) => {
  try {
    const { weekId } = req.params;

    if (!weekId) {
      return res.status(400).json({ error: "Missing weekId parameter." });
    }

    // Run the calculation engine
    const results = await calculateSkins(Number(weekId));

    // Send a clean JSON response back to the frontend button
    return res.status(200).json({
      message: "Success",
      data: results,
    });
  } catch (error) {
    console.error("Skins calculation route error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// 2. This is your existing GET route that renders the EJS template page
router.get("/", async (req, res) => {
  try {
    const weeks = await all(
      `SELECT DISTINCT week_id FROM scores ORDER BY week_id DESC`,
    );
    const selectedWeekId = req.query.weekId
      ? Number(req.query.weekId)
      : weeks[0]?.week_id || null;

    let leaderboard = [];
    let holeDetails = [];
    let totalPot = 0;

    if (selectedWeekId) {
      leaderboard = await all(
        `SELECT ws.member_id, m.name_first, m.name_last, ws.skins_won, ws.payout
         FROM weekly_skins ws
         LEFT JOIN members m ON ws.member_id = m.id
         WHERE ws.week_id = ?
         ORDER BY ws.skins_won DESC, m.name_last ASC`,
        [selectedWeekId],
      );

      holeDetails = await all(
        `SELECT sd.hole_number, sd.score AS net_score, sd.payout, m.name_first, m.name_last, sd.member_id
         FROM skin_details sd
         LEFT JOIN members m ON sd.member_id = m.id
         WHERE sd.week_id = ?
         ORDER BY sd.hole_number ASC`,
        [selectedWeekId],
      );

      totalPot = leaderboard.reduce((sum, player) => sum + player.payout, 0);
    }

    res.render("skins-report", {
      weeks,
      selectedWeekId,
      leaderboard,
      holeDetails,
      totalPot,
    });
  } catch (error) {
    console.error("Skins Report Route Error:", error);
    res.status(500).send("Internal Server Error");
  }
});

export default router;
