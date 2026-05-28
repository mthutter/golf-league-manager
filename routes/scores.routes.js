import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import { showWeeklyScoresForm } from "../controllers/scores.controller.js";

const router = express.Router();

/* =========================================
   ADD WEEKLY SCORES FORM
========================================= */

router.get("/new", authMiddleware, showWeeklyScoresForm);

/* =========================================
   CREATE PLAYER
========================================= */

//router.post("/", authMiddleware, postWeeklyScore);

export default router;
