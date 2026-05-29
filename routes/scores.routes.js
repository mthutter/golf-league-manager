import db from "../config/db.js";
import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import { showWeeklyScoresForm } from "../controllers/scores.controller.js";

const router = express.Router();

/* =========================================
   ADD WEEKLY SCORES FORM
========================================= */

router.get("/new", authMiddleware, (req, res) => {
  const sql = `
    SELECT id, name_first, name_last, handicap
    FROM members
    ORDER BY name_last, name_first
  `;

  db.all(sql, [], (err, members) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Database error");
    }

    res.render("weekly-scores-form", {
      members,
    });
  });
});

//router.post("/", authMiddleware, postWeeklyScore);

export default router;
