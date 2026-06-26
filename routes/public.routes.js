import express from "express";
import * as publicController from "../controllers/public.controller.js";
import * as authController from "../controllers/auth.controller.js";
import { showTeeTimes } from "../controllers/public.controller.js";

const router = express.Router();

// Static Pages & Analytics Layouts
router.get("/", publicController.index);
router.get("/course", publicController.course);
router.get("/rules", publicController.rules);
router.get("/tee-times", showTeeTimes);

// Session Authentication Actions
router.get("/login", authController.showLoginForm);
router.post("/login", authController.handleLogin);
router.get("/logout", authController.handleLogout);

export default router;
