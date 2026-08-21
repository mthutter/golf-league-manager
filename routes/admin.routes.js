import express from "express";
import * as adminController from "../controllers/admin.controller.js";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

// Protect every /admin route globally
router.use(requireAuth);
router.use(requireAdmin);

// 1. GET /admin - Initial dashboard load
router.get("/", adminController.getDashboard);

// 2. POST /admin/skins/calculate - Process skin metrics
router.post("/skins/calculate", adminController.calculateSkinsMetrics);

// 3. POST /admin/handicaps/calculate - Process handicap engine
router.post("/handicaps/calculate", adminController.calculateHandicaps);

// 💡 FIXED: Added the missing route endpoint to map to POST /admin/players/reset-password
router.post("/players/reset-password", adminController.forcePasswordReset);

export default router;
