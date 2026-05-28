import express from "express";
import { imagesByYear } from "../controllers/images.controller.js";

const router = express.Router();

router.get("/:year", imagesByYear);

export default router;
