import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import {
  getPlayers,
  showAddPlayerForm,
  createPlayer,
  getPlayersInactive,
} from "../controllers/players.controller.js";

const router = express.Router();

/* =========================================
   PLAYER LIST
========================================= */

router.get("/", authMiddleware, getPlayers);
router.get("/inactive", authMiddleware, getPlayersInactive);

/* =========================================
   ADD PLAYER FORM
========================================= */

router.get("/new", authMiddleware, showAddPlayerForm);

/* =========================================
   CREATE PLAYER
========================================= */

router.post("/", authMiddleware, createPlayer);

export default router;
