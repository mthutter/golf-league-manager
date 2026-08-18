// players.routes.js
import express from "express";
import {
  getPlayers,
  showAddPlayerForm,
  createPlayer,
  getPlayersInactive,
  showEditPlayerForm,
  updatePlayer,
  showOwnProfileForm,
  updateOwnProfile,
} from "../controllers/players.controller.js";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

/* ========================================= MEMBER SELF PROFILE ========================================= */
// 🔑 PLACE THIS ABOVE PARAMS! Evaluated first.
router.get("/profile", requireAuth, showOwnProfileForm);
router.post("/profile", requireAuth, updateOwnProfile);

/* ========================================= PLAYER LIST ========================================= */
router.get("/", requireAuth, getPlayers);
router.get("/inactive", requireAuth, requireAdmin, getPlayersInactive);

/* ========================================= ADD PLAYER FORM ========================================= */
router.get("/new", requireAuth, requireAdmin, showAddPlayerForm);

/* ========================================= CREATE PLAYER ========================================= */
router.post("/", requireAuth, requireAdmin, createPlayer);

/* ========================================= EDIT / UPDATE PLAYER ========================================= */
// ❌ If these are higher up, /profile hits these and fails
router.get("/:id/edit", requireAuth, requireAdmin, showEditPlayerForm);
router.post("/:id", requireAuth, requireAdmin, updatePlayer);

export default router;
