// routes/handicap.routes.js
import express from "express";
import { getHandicapsDashboard } from "../controllers/handicap.controller.js";

const router = express.Router();

// 🟢 ROUTING ONLY: Defer request/response processing straight to the controller module
router.get("/", getHandicapsDashboard);

export default router;
