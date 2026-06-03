import { calculateSkins } from "../services/skins.service.js";
// Import your custom async db helper methods (adjust path to match where your database code lives)
import { get } from "../config/db.js";
import express from "express";

const router = express.Router();

/**
 * 1. GET /admin
 * Initial load of the Admin Utilities dashboard.
 */
router.get("/", async (req, res) => {
  try {
    const handicapSuccess =
      req.session && req.session.handicapSuccess ? true : false;
    if (req.session) req.session.handicapSuccess = null;

    res.render("admin-utilities", {
      title: "Admin Utilities",
      selectedWeek: undefined,
      results: undefined,
      showHandicapPopup: handicapSuccess,
    });
  } catch (err) {
    console.error("Dashboard render error:", err);
    res.status(500).send("Error loading admin control panel.");
  }
});

/**
 * 2. POST /admin/skins/calculate
 * Processes skin metrics and translates raw player keys into Member names using your get() helper
 */
router.post("/skins/calculate", async (req, res) => {
  try {
    const weekId = Number(req.body.weekId);

    // 1. Unpack real metrics from your calculation service file
    const { skinTotals, payoutPerSkin, totalPot } =
      await calculateSkins(weekId);

    // 2. Loop through calculations and resolve SQLite Member names using your promise-based get() helper
    const formattedWinners = await Promise.all(
      Object.entries(skinTotals || {}).map(async ([playerId, data]) => {
        let memberName = `Player #${playerId}`; // Fallback string if member is missing

        try {
          // Uses your custom exported get() function perfectly with await!
          // Note: If your primary key column name in the database is member_id instead of id, change 'WHERE id = ?'
          const member = await get(
            "SELECT name_last, name_first FROM members WHERE id = ?",
            [playerId],
          );

          if (member) {
            memberName = `${member.name_last}, ${member.name_first}`;
          }
        } catch (sqlError) {
          console.error(
            `SQLite look up failed for player ID ${playerId}:`,
            sqlError,
          );
        }

        return {
          name: memberName,
          holes: data && data.holes ? data.holes : "N/A",
          skinsCount:
            data && typeof data === "object" ? data.count || 0 : data || 0,
          payout:
            (data && typeof data === "object" ? data.count || 0 : data || 0) *
            (payoutPerSkin || 0),
        };
      }),
    );

    // 3. Render template with completed layout configuration
    res.render("admin-utilities", {
      title: "Admin Utilities",
      selectedWeek: weekId,
      showHandicapPopup: false,
      results: {
        totalPot:
          totalPot || formattedWinners.reduce((sum, w) => sum + w.payout, 0),
        winners: formattedWinners,
      },
    });
  } catch (err) {
    console.error("Skins calculation breakdown:", err);
    res.status(500).send("Error running skins calculation framework.");
  }
});

/**
 * 3. POST /admin/handicaps/calculate
 * Handles Player Handicap Engine Requests
 */
router.post("/handicaps/calculate", async (req, res) => {
  try {
    const weekId = Number(req.body.weekId);

    // Your handicap logic here
    console.log(`[HANDICAP ENGINE] Recalculated up to week: ${weekId}`);

    if (req.session) {
      req.session.handicapSuccess = true;
    }

    res.redirect("/admin");
  } catch (err) {
    console.error("Handicap engine breakdown:", err);
    res.status(500).send("Error recalculating league handicaps.");
  }
});

export default router;
