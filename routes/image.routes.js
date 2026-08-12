import express from "express";
import { imagesByYear } from "../controllers/images.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/:year", requireAuth, imagesByYear);

export default router;
