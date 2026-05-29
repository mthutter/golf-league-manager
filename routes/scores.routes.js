import db from "../config/db.js";
import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import { showWeeklyScoresForm } from "../controllers/scores.controller.js";

const router = express.Router();

/* =========================================
   ADD WEEKLY SCORES FORM
========================================= */

router.get("/new", authMiddleware, (req, res) => {
  const memberSql = `
    SELECT id, name_first, name_last, handicap
    FROM members
    ORDER BY name_last, name_first
  `;

  db.all(memberSql, [], (err, members) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Database error");
    }

    const holesSql = `
    SELECT *
    FROM holes
    WHERE hole_number <= 9
    ORDER BY hole_number
    `;

    db.all(holesSql, [], (err, holes) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Database Error");
      }

      res.render("weekly-scores-form", {
        members,
        holes,
      });
    });
  });
});

//router.post("/", authMiddleware, postWeeklyScore);

export default router;
