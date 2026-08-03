import passport from "passport";
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
export const handleLogin = (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      logger.warn({ email: req.body.email }, "Failed login attempt detected");

      posthog.capture({
        distinctId: req.session.id,
        event: "login_failed",
      });

      return res.render("login", {
        error: info?.message ?? "Invalid email or password",
      });
    }

    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }

      logger.info(
        {
          userId: user.id,
          email: user.email,
          roles: user.roles,
          last_name: user.name_last,
          first_name: user.name_first,
        },
        "User successfully authenticated",
      );

      posthog.identify({
        distinctId: String(user.id),
        properties: {
          email: user.email,
          roles: user.roles,
          last_name: user.name_last,
          first_name: user.name_first,
        },
      });

      posthog.capture({
        distinctId: String(user.id),
        event: "user_logged_in",
        properties: {
          roles: user.roles,
        },
      });

      return res.redirect("/");
    });
  })(req, res, next);
};

/**
 * GET /logout - Destroy current session context
 */
export const handleLogout = (req, res, next) => {
  const sessionId = req.session?.id;

  req.logout((err) => {
    if (err) {
      return next(err);
    }

    req.session.destroy((err) => {
      if (err) {
        logger.error({ err }, "Session destruction lifecycle failure during logout operation");
        return next(err);
      }

      posthog.capture({
        distinctId: sessionId,
        event: "user_logged_out",
      });

      res.clearCookie("SessionCookie");
      return res.redirect("/");
    });
  });
};
