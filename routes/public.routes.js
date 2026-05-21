import express from "express";

import homeController from "../controllers/home.js";
import courseController from "../controllers/course.js";
import resultsController from "../controllers/results.js";
import skinsController from "../controllers/skins.js";
import overallController from "../controllers/overall.js";
import rulesController from "../controllers/rules.js";
import teetimesController from "../controllers/tee-times.js";
import videos2024Controller from "../controllers/videos2024.js";
import videos2025Controller from "../controllers/videos2025.js";

const router = express.Router();

router.get("/", homeController);
router.get("/course", courseController);
router.get("/results", resultsController);
router.get("/skins", skinsController);
router.get("/overall", overallController);
router.get("/rules", rulesController);
router.get("/tee-times", teetimesController);
router.get("/videos2024", videos2024Controller);
router.get("/videos2025", videos2025Controller);

export default router;
