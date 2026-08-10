import * as adminService from "../services/admin.service.js";
import * as skinsService from "../services/skins.service.js";
import logger from "../utilities/logger.js";
import { catchAsync } from "../utilities/asyncHandler.js";
import posthog from "../utilities/posthog.js";

/**
 * Handles GET /admin
 */
export const getDashboard = catchAsync(async (req, res, next) => {
  const handicapSuccess = req.session?.handicapSuccess ? true : false;

  if (req.session) {
    req.session.handicapSuccess = null;
  }

  logger.info("Admin dashboard accessed");

  return res.render("admin-utilities", {
    title: "Admin Utilities",
    selectedWeek: undefined,
    results: undefined,
    showHandicapPopup: handicapSuccess,
  });
});

/**
 * Handles POST /admin/skins/calculate
 */
export const calculateSkinsMetrics = catchAsync(async (req, res, next) => {
  const weekId = Number(req.body.weekId);

  logger.info("Starting skins metric calculations");

  // Call service to do the heavy calculations and database queries
  await skinsService.calculateAndSaveSkins(weekId);
  const results = await adminService.processSkinsForWeek(weekId);

  return res.render("admin-utilities", {
    title: "Admin Utilities",
    selectedWeek: weekId,
    showHandicapPopup: false,
    results: results,
  });
});

/**
 * Handles POST /admin/handicaps/calculate
 */
export const calculateHandicaps = catchAsync(async (req, res, next) => {
  logger.info("Triggering handicap calculation engine");

  // Call service to run engine logic
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
