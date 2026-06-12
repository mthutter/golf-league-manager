import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import {
  getPlayers,
  showAddPlayerForm,
  createPlayer,
  getPlayersInactive,
  showEditPlayerForm, // New controller function
  updatePlayer, // New controller function
} from "../controllers/players.controller.js";

const router = express.Router();

/* ========================================= PLAYER LIST ========================================= */
router.get("/", authMiddleware, getPlayers);
router.get("/inactive", authMiddleware, getPlayersInactive);

/* ========================================= ADD PLAYER FORM ========================================= */
router.get("/new", authMiddleware, showAddPlayerForm);

/* ========================================= CREATE PLAYER ========================================= */
router.post("/", authMiddleware, createPlayer);

/* ========================================= EDIT PLAYER FORM ========================================= */
// Fetches player data and renders the modify-player.ejs file
router.get("/:id/edit", authMiddleware, showEditPlayerForm);

/* ========================================= UPDATE PLAYER ========================================= */
// Handles the form submission data and updates the database
// Note: If you use HTML's native POST method, map it to POST.
// If your app uses 'method-override' middleware, you can change router.post to router.put below.
router.post("/:id", authMiddleware, updatePlayer);

export default router;
