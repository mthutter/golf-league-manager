import express from "express";
import * as skinsController from "../controllers/skins.controller.js";

const router = express.Router();

// 1. POST /skins/calculate/:weekId - Run engine from frontend button
router.post("/calculate/:weekId", skinsController.calculateSkinsApi);

// 2. GET /skins/ - Render the EJS template page
router.get("/", skinsController.getSkinsReport);

export default router;
