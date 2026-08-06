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
    
    logger.info({ user }, "Authenticated user");

    if (!user) {
      logger.warn({ email: req.body.email }, "Failed login attempt detected");
      
      // Ensure we have a valid identifier fallback for an anonymous session
      const anonymousId = req.sessionID || req.session?.id || "anonymous_backend_session";
      
      posthog.capture({
        distinctId: String(anonymousId),
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
          last_name: user.lastName,
          first_name: user.firstName,
        },
        "User successfully authenticated",
      );

      posthog.capture({
        distinctId: String(user.id),
        event: "user_logged_in",
        properties: {
          member_id: user.id,
          member_name: `${user.lastName}, ${user.firstName}`,
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
  // 1. Capture the ID safely before running asynchronous destruction triggers
  const userId = req.user?.id ? String(req.user.id) : null;

  req.logout((err) => {
    if (err) {
      return next(err);
    }
    
    req.session.destroy((err) => {
      if (err) {
        logger.error({ err }, "Session destruction lifecycle failure during logout operation");
        return next(err);
      }

      // 2. Only send the event if we confirmed a valid user was logged in
      if (userId) {
        posthog.capture({
          distinctId: userId,
          event: "user_logged_out",
        });
      }

      res.clearCookie("SessionCookie");
      return res.redirect("/");
    });
  });
};
