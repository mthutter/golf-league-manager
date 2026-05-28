import express from "express";
import { videosByYear } from "../controllers/videos.controller.js";

const router = express.Router();

router.get("/:year", videosByYear);

export default router;
