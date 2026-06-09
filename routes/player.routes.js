import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import {
  getPlayers,
  showAddPlayerForm,
  createPlayer,
  getPlayersInactive,
  showEditPlayerForm, // NEW
  updatePlayer, // NEW
} from "../controllers/players.controller.js";

const router = express.Router();

/* ========================================= PLAYER LIST ========================================= */
router.get("/", authMiddleware, getPlayers);
router.get("/inactive", authMiddleware, getPlayersInactive);

/* ========================================= ADD PLAYER FORM ========================================= */
router.get("/new", authMiddleware, showAddPlayerForm);

/* ========================================= CREATE PLAYER ========================================= */
router.post("/", authMiddleware, createPlayer);

/* ========================================= MODIFY PLAYER ========================================= */
// GET route to load the form populated with the player's current data
router.get("/:id/edit", authMiddleware, showEditPlayerForm);

// POST route matching the form action URL schema to save changes
router.post("/:id", authMiddleware, updatePlayer);

export default router;
