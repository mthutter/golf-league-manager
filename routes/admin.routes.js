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

// 4. POST /admin/players/reset-password - Password Override
router.post("/players/reset-password", adminController.forcePasswordReset);

// 1. GET: Render the dedicated blacklist list page
router.get("/security/blacklist", adminController.getBlacklistRoster);

// 2. POST: Process bans (Update your existing route redirect target inside the controller)
router.post("/security/blacklist", adminController.processBulkIpBlacklist);

// 3. POST: Remove individual IP ban
router.post("/security/blacklist/delete", adminController.unbanIpAddress);

export default router;
