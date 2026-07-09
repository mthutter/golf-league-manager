import * as authService from "../services/auth.service.js";
import logger from "../utilities/logger.js";
import { catchAsync } from "../utilities/asyncHandler.js";
import posthog from "../utilities/posthog.js";

/**
 * GET /login - Show login page
 */
export const showLoginForm = (req, res) => {
  return res.render("login");
};

/**
 * POST /login - Process user authorization (Supports Admin & League Member)
 */
export const handleLogin = catchAsync(async (req, res, next) => {
  const { username, password } = req.body;

  // 1. Check for Admin Credentials
  const isAdminValid = authService.verifyAdminCredentials(username, password);
  if (isAdminValid) {
    req.session.isAdmin = true;
    req.session.isUser = true; // Admins also count as general users

    logger.info(
      { username, isAdmin: true },
      "Admin successfully authenticated",
    );
    posthog.identify({
      distinctId: req.session.id,
      properties: { role: "admin" },
    });
    posthog.capture({
      distinctId: req.session.id,
      event: "user_logged_in",
      properties: { role: "admin" },
    });
    return res.redirect("/");
  }

  // 2. Check for Non-Admin Member Credentials
  const isUserValid = authService.verifyUserCredentials
    ? authService.verifyUserCredentials(username, password)
    : false;

  if (isUserValid) {
    req.session.isAdmin = false;
    req.session.isUser = true; // Flag identifying them as a standard authenticated league member

    logger.info(
      { username, isAdmin: false },
      "League member successfully authenticated",
    );
    posthog.identify({
      distinctId: req.session.id,
      properties: { role: "member" },
    });
    posthog.capture({
      distinctId: req.session.id,
      event: "user_logged_in",
      properties: { role: "member" },
    });
    return res.redirect("/");
  }

  // 3. Fallback if both checks fail
  logger.warn({ username }, "Failed login attempt detected");
  posthog.capture({ distinctId: req.session.id, event: "login_failed" });
  return res.render("login", { error: "Invalid username or password" });
});

/**
 * GET /logout - Destroy current session context
 */
export const handleLogout = (req, res, next) => {
  const username = req.session?.username || "unknown";
  const sessionId = req.session?.id || "anonymous";

  req.session.destroy((err) => {
    if (err) {
      // Handled cleanly via Pino JSON formatting strings
      logger.error(
        { err },
        "Session destruction lifecycle failure during logout operation",
      );
      return next(err); // Forwards session system exceptions safely to centralized middleware
    }

    logger.info({ username }, "User logged out successfully");
    posthog.capture({ distinctId: sessionId, event: "user_logged_out" });

    // FIX: Match your custom cookie name "SessionCookie" defined in app.js
    res.clearCookie("SessionCookie");
    return res.redirect("/");
  });
};
