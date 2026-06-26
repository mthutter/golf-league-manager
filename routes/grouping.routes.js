import express from "express";
import {
  showTeeTimes,
  generateGroupings,
} from "../controllers/groupings.controller.js";

const router = express.Router();

router.get("/tee-times", showTeeTimes);
router.post("/groupings/generate/:weekId", generateGroupings);

export default router;
