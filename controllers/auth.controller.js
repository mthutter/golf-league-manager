import * as authService from "../services/auth.service.js";

/**
 * GET /login - Show login page
 */
export function showLoginForm(req, res) {
  res.render("login");
}

/**
 * POST /login - Process user authorization (Supports Admin & League Member)
 */
export function handleLogin(req, res) {
  const { username, password } = req.body;

  // 1. Check for Admin Credentials
  const isAdminValid = authService.verifyAdminCredentials(username, password);
  if (isAdminValid) {
    req.session.isAdmin = true;
    req.session.isUser = true; // Admins also count as general users
    return res.redirect("/");
  }

  // 2. Check for Non-Admin Member Credentials
  // Note: You will need to create 'verifyUserCredentials' in your auth.service.js
  const isUserValid = authService.verifyUserCredentials
    ? authService.verifyUserCredentials(username, password)
    : false;
  if (isUserValid) {
    req.session.isAdmin = false;
    req.session.isUser = true; // Flag identifying them as a standard authenticated league member
    return res.redirect("/");
  }

  // 3. Fallback if both checks fail
  res.render("login", { error: "Invalid username or password" });
}

/**
 * GET /logout - Destroy current session context
 */
export function handleLogout(req, res) {
  req.session.destroy((err) => {
    if (err) {
      console.error("Session destruction failure:", err);
    }
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
}
