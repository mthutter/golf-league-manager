import express from "express";
import * as adminController from "../controllers/admin.controller.js";
// 🟢 ADDED: Import your updated security controller file
import { securityController } from "../controllers/security.controller.js";
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

// 🟢 FIXED: Route the dashboard render directly to your security controller SQL module
router.get("/security/blacklist", securityController.getBlacklist);

// 🟢 FIXED: Route manual ban submission directly to your security controller logic
router.post("/security/blacklist/add", securityController.addManualBan);

// 🟢 FIXED: Route the unban action form directly to your security cache logic
router.post("/security/blacklist/delete", securityController.liftBan);

export default router;
