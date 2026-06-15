import * as adminService from "../services/admin.service.js";
import * as skinsService from "../services/skins.service.js";

/**
 * Handles GET /admin
 */
export const getDashboard = async (req, res) => {
  try {
    const handicapSuccess = req.session?.handicapSuccess ? true : false;
    if (req.session) req.session.handicapSuccess = null;

    res.render("admin-utilities", {
      title: "Admin Utilities",
      selectedWeek: undefined,
      results: undefined,
      showHandicapPopup: handicapSuccess,
    });
  } catch (err) {
    console.error("Dashboard render error:", err);
    res.status(500).send("Error loading admin control panel.");
  }
};

/**
 * Handles POST /admin/skins/calculate
 */
export const calculateSkinsMetrics = async (req, res) => {
  try {
    const weekId = Number(req.body.weekId);

    // Call service to do the heavy calculations and database queries
    await skinsService.calculateAndSaveSkins(weekId);

    const results = await adminService.processSkinsForWeek(weekId);

    res.render("admin-utilities", {
      title: "Admin Utilities",
      selectedWeek: weekId,
      showHandicapPopup: false,
      results: results,
    });
  } catch (err) {
    console.error("Skins calculation breakdown:", err);
    res.status(500).send("Error running skins calculation framework.");
  }
};

/**
 * Handles POST /admin/handicaps/calculate
 */
export const calculateHandicaps = async (req, res) => {
  try {
    // Call service to run engine logic
    await adminService.runHandicapEngine(weekId);

    if (req.session) {
      req.session.handicapSuccess = true;
    }
    res.redirect("/admin");
  } catch (err) {
    console.error("Handicap engine breakdown:", err);
    res.status(500).send("Error recalculating league handicaps.");
  }
};
