import express from "express";
import * as skinsController from "../controllers/skins.controller.js";

const router = express.Router();

// 1. POST /skins/calculate/:weekId - Run engine from frontend button
router.post("/calculate/:weekId", skinsController.calculateSkinsApi);

// 2. GET /skins/ - Render the EJS template page
router.get("/", skinsController.getSkinsReport);

//router.get("/calculate/:weekId", async (req, res) => {
//  try {
//    const results = await skinsService.calculateAndSaveSkins(
//      Number(req.params.weekId),
//    );
//
//    res.json(results);
//  } catch (err) {
//    console.error(err);
//    res.status(500).json(err);
//  }
//});

router.get("/calculate/:weekId", skinsController.calculateSkinsApi);

export default router;
