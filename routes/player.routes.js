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
import { requireAuth, requireAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

/* ========================================= PLAYER LIST ========================================= */
// 🔓 Open to any authenticated player or admin
router.get("/", requireAuth, getPlayers);

// 🔒 Restricted to Admin view lists only
router.get("/inactive", requireAuth, requireAdmin, getPlayersInactive);

/* ========================================= ADD PLAYER FORM ========================================= */
// 🔒 Admin-only action
router.get("/new", requireAuth, requireAdmin, showAddPlayerForm);

/* ========================================= CREATE PLAYER ========================================= */
// 🔒 Admin-only action
router.post("/", requireAuth, requireAdmin, createPlayer);

/* ========================================= EDIT PLAYER FORM ========================================= */
// 🔒 Admin-only action
router.get("/:id/edit", requireAuth, requireAdmin, showEditPlayerForm);

/* ========================================= UPDATE PLAYER ========================================= */
// 🔒 Admin-only action
router.post("/:id", requireAuth, requireAdmin, updatePlayer);

export default router;
