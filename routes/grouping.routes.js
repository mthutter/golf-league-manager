import express from "express";
import { 
    showTeeTimes, 
    generateGroupings, 
    swapPlayers 
} from "../controllers/grouping.controller.js";

const router = express.Router();

/**
 * @route   GET /tee-times
 * @desc    Display the tee time assignments page for a specific week
 * @access  Public
 */
router.get("/tee-times", showTeeTimes);

/**
 * @route   POST /groupings/generate/:weekId
 * @desc    Trigger the generation algorithm and redirect to the viewer
 * @access  Public (or Admin)
 */
router.post("/groupings/generate/:weekId", generateGroupings);

/**
 * @route   PUT /groupings/swap
 * @desc    Manually swap two players' slots on the grid or out list
 * @access  Private/Admin
 */
router.put("/groupings/swap", swapPlayers); // 🛠️ FIX: Removed generateGroupings middleware interceptor

export default router;
