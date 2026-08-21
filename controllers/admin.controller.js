import * as adminService from "../services/admin.service.js";
import * as skinsService from "../services/skins.service.js";
import * as authService from "../services/auth.service.js"; // 💡 Injected auth mapping
import { all, run } from "../config/db.js"; // 💡 Injected database write core
import logger from "../utilities/logger.js";
import { catchAsync } from "../utilities/asyncHandler.js";
import posthog from "../utilities/posthog.js";
import { securityModel } from "../models/security.model.js";

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

  logger.warn({ memberId, actorId: req.session?.id }, "Admin forced password assignment sequence triggered");

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

  logger.info({ memberId }, "User credentials reset and account fully forced to active status state.");
  return res.redirect("/admin");
});

export async function processBulkIpBlacklist(req, res, next) {
  try {
    const rawIpInput = req.body.ipList || "";

    // Splits by lines, commas, or spaces, cleans up whitespace, and drops empty rows
    const targets = rawIpInput
      .split(/[\n, ]+/)
      .map((ip) => ip.trim())
      .filter(Boolean);

    if (targets.length === 0) {
      req.flash("error", "No valid IP addresses were provided.");
      return res.redirect("/admin/security/blacklist");
    }

    let processedCount = 0;

    // Sequentially insert each clean IP into the database and live cache layer
    for (const ip of targets) {
      await securityModel.manuallyBanIP(ip);
      processedCount++;
    }

    req.flash("success", `Successfully blacklisted ${processedCount} IP address(es) across the platform.`);
    res.redirect("/admin/security/blacklist");
  } catch (err) {
    logger.error("[ADMIN CONTROLLER] Bulk blacklist parsing failed:", err);
    next(err);
  }
}
/**
 * GET: Render the active blacklist table view
 */
export async function getBlacklistRoster(req, res, next) {
  try {
    // Query your permanent_bans table sorted by the most recent additions
    const bannedIps = await all("SELECT ip, strikes, first_seen, last_seen FROM permanent_bans ORDER BY last_seen DESC");

    res.render("blacklist", {
      bannedIps,
      success: req.flash("success"),
      error: req.flash("error"),
    });
  } catch (err) {
    logger.error("[ADMIN CONTROLLER] Failed to load blacklist roster:", err);
    next(err);
  }
}

/**
 * POST: Remove an IP from the blacklist database and memory cache
 */
export async function unbanIpAddress(req, res, next) {
  try {
    const targetIp = req.body.ip?.trim();
    if (!targetIp) {
      req.flash("error", "No target IP address provided.");
      return res.redirect("/admin/security/blacklist");
    }

    // 1. Delete row from SQLite table
    await run("DELETE FROM permanent_bans WHERE ip = ?", [targetIp]);

    // 2. Clear it from your securityModel memory caches
    securityModel.permanentBanCache.delete(targetIp);
    securityModel.transientBanCache.del(targetIp);

    logger.info(`[SECURITY MANUAL] Admin manually unbanned IP: ${targetIp}`);
    req.flash("success", `Successfully lifted firewall ban for IP: ${targetIp}`);
    res.redirect("/admin/security/blacklist");
  } catch (err) {
    logger.error(`[ADMIN CONTROLLER] Unban action failed for ${req.body.ip}:`, err);
    next(err);
  }
}
