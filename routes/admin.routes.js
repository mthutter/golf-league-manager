import { calculateSkins } from "../services/skins.service.js";
import express from "express";

const router = express.Router();

router.post("/skins/calculate", async (req, res) => {
  try {
    const weekId = Number(req.body.weekId);

    await calculateSkins(weekId);
    res.redirect(`/admin/skins/${weekId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error calculating skins.");
  }
});

router.get("/", async (req, res) => {
  res.render("admin");
});

router.get("/skins/:weekId", async (req, res) => {
  res.send(`Week ${req.params.weekId}`);
});

export default router;
