// players.routes.js
import express from "express";
// We don't necessarily need the old middleware if we define the flexible role checks here
import {
  getPlayers,
  showAddPlayerForm,
  createPlayer,
  getPlayersInactive,
  showEditPlayerForm,
  updatePlayer,
} from "../controllers/players.controller.js";

const router = express.Router();

/**
 * 🔓 Level 1 Check: Requires any valid league authentication (Player or Admin)
 */
function requireLogin(req, res, next) {
  if (req.session && req.session.isUser) {
    return next(); // Valid member, let them see the content
  }
  res.redirect("/login");
}

/**
 * 🔒 Level 2 Check: Restricts route explicitly to Administrators
 */
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next(); // Valid admin, let them manage assets
  }
  res
    .status(403)
    .send("Access Denied: This action requires Administrator privileges.");
}

/* ========================================= PLAYER LIST ========================================= */
// 🔓 Open to any authenticated player or admin
router.get("/", requireLogin, getPlayers);

// 🔒 Restricted to Admin view lists only
router.get("/inactive", requireLogin, requireAdmin, getPlayersInactive);

/* ========================================= ADD PLAYER FORM ========================================= */
// 🔒 Admin-only action
router.get("/new", requireLogin, requireAdmin, showAddPlayerForm);

/* ========================================= CREATE PLAYER ========================================= */
// 🔒 Admin-only action
router.post("/", requireLogin, requireAdmin, createPlayer);

/* ========================================= EDIT PLAYER FORM ========================================= */
// 🔒 Admin-only action
router.get("/:id/edit", requireLogin, requireAdmin, showEditPlayerForm);

/* ========================================= UPDATE PLAYER ========================================= */
// 🔒 Admin-only action
router.post("/:id", requireLogin, requireAdmin, updatePlayer);

export default router;
