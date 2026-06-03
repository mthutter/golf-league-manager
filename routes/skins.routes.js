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
    let participantScores = [];
    let courseHandicaps = {};
    let totalPot = 0;

    if (selectedWeekId) {
      // 1. Fetch hole difficulty mappings for our columns
      const holeData = await all(
        `SELECT hole_number, handicap_men FROM holes WHERE hole_number BETWEEN 1 AND 9`,
      );
      holeData.forEach((h) => {
        courseHandicaps[h.hole_number] = h.handicap_men;
      });

      // 2. Fetch Leaderboard summary
      leaderboard = await all(
        `SELECT ws.member_id, m.name_first, m.name_last, ws.skins_won, ws.payout
         FROM weekly_skins ws
         LEFT JOIN members m ON ws.member_id = m.id
         WHERE ws.week_id = ?
         ORDER BY ws.skins_won DESC, m.name_last ASC`,
        [selectedWeekId],
      );

      // 3. Fetch specific hole line item winners
      holeDetails = await all(
        `SELECT sd.hole_number, sd.score AS net_score, sd.payout, m.name_first, m.name_last, sd.member_id
         FROM skin_details sd
         LEFT JOIN members m ON sd.member_id = m.id
         WHERE sd.week_id = ?`,
        [selectedWeekId],
      );

      // 4. NEW: Fetch ALL registered players & calculate gross/net on-the-fly for the comprehensive table matrix
      const rawCards = await all(
        `SELECT s.*, m.name_first, m.name_last 
         FROM scores s
         LEFT JOIN members m ON s.member_id = m.id
         WHERE s.week_id = ? AND s.skins_entered = 1
         ORDER BY m.name_last ASC`,
        [selectedWeekId],
      );

      participantScores = rawCards.map((player) => {
        const raw9HoleHandicap = player.handicap_used || 0;
        const emulated18Handicap = raw9HoleHandicap * 2;
        const holesArray = [];

        // Loop holes 1-9 to calculate net maps
        for (let h = 1; h <= 9; h++) {
          const gross = player[`gross${h}`] || 0;
          const holeDifficultyIndex = courseHandicaps[h] || 18;

          let strokesAllowed = Math.floor(emulated18Handicap / 18);
          const leftoverStrokes = emulated18Handicap % 18;
          if (leftoverStrokes >= holeDifficultyIndex) {
            strokesAllowed += 1;
          }

          holesArray.push({
            holeNumber: h,
            gross: gross,
            net: gross > 0 ? gross - strokesAllowed : 0,
            strokes: strokesAllowed,
          });
        }

        return {
          memberId: player.member_id,
          name: `${player.name_first} ${player.name_last}`,
          handicap: raw9HoleHandicap,
          holes: holesArray,
        };
      });

      totalPot = leaderboard.reduce((sum, player) => sum + player.payout, 0);
    }

    res.render("skins-report", {
      weeks,
      selectedWeekId,
      leaderboard,
      holeDetails,
      participantScores, // Sent to EJS matrix loop
      totalPot,
    });
  } catch (error) {
    console.error("Skins Report Route Error:", error);
    res.status(500).send("Internal Server Error");
  }
});

export default router;
