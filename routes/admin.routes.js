import express from "express";
import * as adminController from "../controllers/admin.controller.js";

const router = express.Router();

// 1. GET /admin - Initial dashboard load
router.get("/", adminController.getDashboard);

// 2. POST /admin/skins/calculate - Process skin metrics
router.post("/skins/calculate", adminController.calculateSkinsMetrics);

// 3. POST /admin/handicaps/calculate - Process handicap engine
router.post("/handicaps/calculate", adminController.calculateHandicaps);

export default router;
