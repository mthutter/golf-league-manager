import * as adminService from "../services/admin.service.js";
import * as skinsService from "../services/skins.service.js";
import * as authService from "../services/auth.service.js"; // 💡 Injected auth mapping
import { run } from "../config/db.js"; // 💡 Injected database write core
import logger from "../utilities/logger.js";
import { catchAsync } from "../utilities/asyncHandler.js";
import posthog from "../utilities/posthog.js";

/**
 * Handles GET /admin
 */
export const getDashboard = catchAsync(async (req, res) => {
  const handicapSuccess = req.session?.handicapSuccess ? true : false;
  if (req.session) {
    req.session.handicapSuccess = null;
  }

  // 💡 UPDATED: Fetches all master records (including system admins, test users, and archived players)
  const masterUserList = await adminService.getAllSystemUsers();

  logger.info("Admin dashboard accessed");
  return res.render("admin-utilities", {
    title: "Admin Utilities",
    selectedWeek: undefined,
    results: undefined,
    showHandicapPopup: handicapSuccess,
    members: masterUserList, // 💡 Injected master collection into view parameters
  });
});

/**
 * Handles POST /admin/skins/calculate
 */
export const calculateSkinsMetrics = catchAsync(async (req, res) => {
  const weekId = Number(req.body.weekId);
  logger.info("Starting skins metric calculations");

  await skinsService.calculateAndSaveSkins(weekId);
  const results = await adminService.processSkinsForWeek(weekId);

  // Pull the list here as well so the selection list doesn't disappear when results display
  const masterUserList = await adminService.getAllSystemUsers();

  return res.render("admin-utilities", {
    title: "Admin Utilities",
    selectedWeek: weekId,
    showHandicapPopup: false,
    results: results,
    members: masterUserList,
  });
});
/**
 * Handles POST /admin/handicaps/calculate
 */
export const calculateHandicaps = catchAsync(async (req, res) => {
  logger.info("Triggering handicap calculation engine");

  await adminService.runHandicapEngine();
  posthog.capture({
    distinctId: req.session?.id || "anonymous",
    event: "handicaps_calculated",
  });

  if (req.session) {
    req.session.handicapSuccess = true;
  }
  return res.redirect("/admin");
});

/**
 * Handles POST /admin/players/reset-password
 * Overwrites password hash and automatically toggles account parameters to an active status state
 */
export const forcePasswordReset = catchAsync(async (req, res) => {
  const memberId = Number(req.body.memberId);
  const newPassword = req.body.newPassword?.trim();

  logger.warn(
    { memberId, actorId: req.session?.id },
    "Admin forced password assignment sequence triggered",
  );

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).send("Password must be at least 6 characters long.");
  }

  // 1. Encrypt and overwrite the password string using your existing crypto service method
  await authService.updateMemberPassword(memberId, newPassword);

  // 2. 💡 BYPASS OVERRIDE: Forcibly force-activates the account instantly in SQLite
  await run(
    `
        UPDATE members 
        SET is_active = 1, 
            status = 'Yes' 
        WHERE id = ?
        `,
    [memberId],
  );

  posthog.capture({
    distinctId: req.session?.id || "anonymous",
    event: "admin_forced_password_reset_and_activation",
    properties: { target_member_id: memberId },
  });

  logger.info(
    { memberId },
    "User credentials reset and account fully forced to active status state.",
  );
  return res.redirect("/admin");
});
