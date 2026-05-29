import db from "../config/db.js";
import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import { showWeeklyScoresForm } from "../controllers/scores.controller.js";
import { getScores } from "../controllers/scores.controller.js";

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

router.post("/save", authMiddleware, (req, res) => {
  const sql = `
    INSERT INTO scores (
      week_id,
      member_id,
      handicap_used,
      gross1,gross2,gross3,gross4,gross5,
      gross6,gross7,gross8,gross9,
      gross_total,
      net_total,
      stableford_total
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `;

  const params = [
    req.body.weekId,
    req.body.memberId,
    req.body.handicap,

    req.body.gross1,
    req.body.gross2,
    req.body.gross3,
    req.body.gross4,
    req.body.gross5,
    req.body.gross6,
    req.body.gross7,
    req.body.gross8,
    req.body.gross9,

    req.body.gross_total,
    req.body.net_total,
    req.body.stableford_total,
  ];

  db.run(sql, params, function (err) {
    if (err) {
      console.error(err);

      if (err.message.includes("UNIQUE")) {
        return res
          .status(400)
          .send("Scores already entered for this player/week.");
      }

      return res.status(500).send("Database error");
    }

    res.redirect("/scores/new");
  });
});

router.get("/", authMiddleware, getScores);

export default router;
