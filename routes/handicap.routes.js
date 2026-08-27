// routes/handicap.routes.js
import express from "express";
import { getHandicapsDashboard } from "../controllers/handicap.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

// 🟢 ROUTING ONLY: Defer request/response processing straight to the controller module
router.get("/", getHandicapsDashboard);

export default router;
