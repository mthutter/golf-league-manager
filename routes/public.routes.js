import express from "express";
import homeController from "../controllers/home.js";
import courseController from "../controllers/course.js";
import resultsController from "../controllers/results.js";
import skinsController from "../controllers/skins.js";
import overallController from "../controllers/overall.js";
import rulesController from "../controllers/rules.js";
import teetimesController from "../controllers/tee-times.js";
import * as authController from "../controllers/auth.controller.js";

const router = express.Router();

// Static Pages & Analytics Layouts
router.get("/", homeController);
router.get("/course", courseController);
router.get("/results", resultsController);
router.get("/skins", skinsController);
router.get("/overall", overallController);
router.get("/rules", rulesController);
router.get("/tee-times", teetimesController);

// Session Authentication Actions
router.get("/login", authController.showLoginForm);
router.post("/login", authController.handleLogin);
router.get("/logout", authController.handleLogout);

export default router;
