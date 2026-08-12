import express from "express";
import { requireAdmin } from "../middleware/auth.middleware.js";
import * as scoresController from "../controllers/scores.controller.js";

const router = express.Router();

// 1. GET /scores/new - Form to add weekly scores
router.get("/new", requireAdmin, scoresController.getNewScoresForm);

// 2. POST /scores/save - Save a score record
router.post("/save", requireAdmin, scoresController.saveScore);

// 3. GET /scores/standings - Season standings leaderboard
router.get("/standings", scoresController.getStandings);

// 4. GET /scores/weekly/:weekId - Weekly score summaries
router.get("/weekly/:weekId", scoresController.getWeeklyScores);

// 5. GET /scores/members/:id - Individual member score history
router.get("/members/:id", scoresController.getMemberProfile);

// 6. GET /scores/ - Fallback/legacy handler
router.get("/", requireAdmin, scoresController.getScoresLegacy);

// 7. GET /scores/round/:scoreId - Individual hole-to-hole scoring per week
router.get("/round/:scoreId", scoresController.getRoundDetails);

/** =========================================================================
 *  NEW MODIFY / EDIT ROUTES
 *  ========================================================================= */

// 8. GET /scores/edit/:scoreId - Render the score modification form with filled values
router.get("/edit/:scoreId", requireAdmin, scoresController.getModifyScoresForm);

// 9. POST /scores/update/:scoreId - Process changes and commit them to SQLite
router.post("/update/:scoreId", requireAdmin, scoresController.updateScore);

export default router;
