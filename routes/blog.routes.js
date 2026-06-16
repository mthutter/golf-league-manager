// blog.routes.js
import express from "express";
import * as blogController from "../controllers/blog.controller.js"; // Adjust path to your controller

const router = express.Router();

/**
 * 🔓 Level 1 Check: Requires any valid league login (Player or Admin)
 */
function requireLogin(req, res, next) {
  if (req.session && req.session.isUser) {
    return next(); // Valid member, let them read the blog
  }
  res.redirect("/login");
}

/**
 * 🔒 Level 2 Check: Restricts route explicitly to Administrators
 */
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next(); // Valid admin, let them create posts
  }
  res
    .status(403)
    .send("Access Denied: Only league administrators can publish blog posts.");
}

/* ========================================= READ BLOG (Players & Admins) ========================================= */

// Both players and admins can see the feed list and read articles
router.get("/", requireLogin, blogController.renderIndex);

// 🔒 Block regular players from opening the composition form
router.get("/new", requireLogin, requireAdmin, blogController.renderNewForm);

router.get("/:slug", requireLogin, blogController.renderPost);

/* ========================================= WRITE BLOG (Admin ONLY) ========================================= */

// 🔒 Block regular players from submitting new post data
router.post("/", requireLogin, requireAdmin, blogController.createPost);

export default router;
