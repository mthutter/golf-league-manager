import * as authService from "../services/auth.service.js";

/**
 * GET /login - Show login page
 */
export function showLoginForm(req, res) {
  res.render("login");
}

/**
 * POST /login - Process user authorization
 */
export function handleLogin(req, res) {
  const { username, password } = req.body;

  // Delegate credential check to service layer
  const isValid = authService.verifyAdminCredentials(username, password);

  if (isValid) {
    req.session.isAdmin = true;
    return res.redirect("/");
  }

  res.render("login", { error: "Invalid username or password" });
}

/**
 * GET /logout - Destroy current session context
 */
export function handleLogout(req, res) {
  // If your service or workflow ever scales beyond local sessions,
  // you can hook service logic directly here.
  req.session.destroy((err) => {
    if (err) {
      console.error("Session destruction failure:", err);
    }
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
}
