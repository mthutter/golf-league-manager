import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import * as scoresController from "../controllers/scores.controller.js";

const router = express.Router();

// 1. GET /scores/new - Form to add weekly scores
router.get("/new", authMiddleware, scoresController.getNewScoresForm);

// 2. POST /scores/save - Save a score record
router.post("/save", authMiddleware, scoresController.saveScore);

// 3. GET /scores/standings - Season standings leaderboard
router.get("/standings", scoresController.getStandings);

// 4. GET /scores/weekly/:weekId - Weekly score summaries
router.get("/weekly/:weekId", scoresController.getWeeklyScores);

// 5. GET /scores/members/:id - Individual member score history
router.get("/members/:id", scoresController.getMemberProfile);

// 6. GET /scores/ - Fallback/legacy handler
router.get("/", authMiddleware, scoresController.getScoresLegacy);

export default router;
