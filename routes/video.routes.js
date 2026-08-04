import express from "express";
import { videosByYear } from "../controllers/videos.controller.js";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/:year", requireAuth, videosByYear);

export default router;
