import express from "express";
import { showTeeTimes, generateGroupings, swapPlayers } from "../controllers/grouping.controller.js";

import { requireAuth, requireAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * @route   GET /tee-times
 * @desc    Display the tee time assignments page for a specific week
 * @access  Public
 */
router.get("/tee-times", requireAuth, showTeeTimes);

/**
 * @route   POST /groupings/generate/:weekId
 * @desc    Trigger the generation algorithm and redirect to the viewer
 * @access  Admin
 */
router.post("/groupings/generate/:weekId", requireAuth, requireAdmin, generateGroupings);

/**
 * @route   PUT /groupings/swap
 * @desc    Manually swap two players' slots on the grid or out list
 * @access  Admin
 */
router.put("/groupings/swap", requireAuth, requireAdmin, swapPlayers);

export default router;
