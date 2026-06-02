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
      ctp_points,
      birdie_points,
      gross1,gross2,gross3,gross4,gross5,
      gross6,gross7,gross8,gross9,
      gross_total,
      net_total,
      stableford_total
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `;

  const params = [
    req.body.weekId,
    req.body.memberId,
    req.body.handicap,
    req.body.ctp_points,
    req.body.birdie_points,
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

router.get("/standings", (req, res) => {
  const standingsSql = `
    SELECT
      m.id,
       m.name_first || ' ' || m.name_last AS player_name,

      COUNT(s.score_id) AS weeks_played,
      SUM(s.stableford_total) AS stableford_points,
      SUM(s.ctp_points) AS ctp_points,
      SUM(s.birdie_points) AS birdie_points,
      SUM(
          s.stableford_total +
          s.ctp_points +
          s.birdie_points
      ) AS total_points,

    ROUND(SUM(
          s.stableford_total +
          s.ctp_points +
          s.birdie_points
      ) * 1.0 /
      NULLIF(COUNT(s.score_id), 0), 2) AS avg_points,

      ROUND(AVG(s.gross_total),2) AS avg_gross,

      ROUND(AVG(s.net_total),2) AS avg_net

    FROM members m
    LEFT JOIN scores s
      ON s.member_id = m.id

    GROUP BY
      m.id,
      m.name_first,
      m.name_last

    ORDER BY
      avg_points DESC,
      total_points DESC      
  `;
  db.all(standingsSql, [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Database Error");
    }

    res.render("standings", {
      standings: rows,
    });
  });
});

router.get("/weekly/:weekId", (req, res) => {
  const weekId = req.params.weekId;

  const rowsSql = `
    SELECT
      m.name_first || ' ' || m.name_last AS player_name,
      s.gross_total,
      s.net_total,
      s.stableford_total,
      s.ctp_points,
      s.birdie_points,
      (
        s.stableford_total +
        s.ctp_points +
        s.birdie_points
      ) AS total_points
    FROM scores s
    JOIN members m
      ON m.id = s.member_id
    WHERE s.week_id = ?
    ORDER BY total_points DESC
  `;

  db.all(rowsSql, [weekId], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Database Error");
    }

    res.render("weekly", {
      weekId,
      results: rows,
    });
  });
});

router.get("/", authMiddleware, getScores);

export default router;
