import express from "express";

import homeController from "../controllers/home.js";
import courseController from "../controllers/course.js";
import resultsController from "../controllers/results.js";
import skinsController from "../controllers/skins.js";
import overallController from "../controllers/overall.js";
import rulesController from "../controllers/rules.js";
import teetimesController from "../controllers/tee-times.js";

const router = express.Router();

router.get("/", homeController);
router.get("/course", courseController);
router.get("/results", resultsController);
router.get("/skins", skinsController);
router.get("/overall", overallController);
router.get("/rules", rulesController);
router.get("/tee-times", teetimesController);

export default router;
