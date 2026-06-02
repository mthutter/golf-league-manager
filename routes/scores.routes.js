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
    WITH raw_standings AS (
      SELECT 
        m.id, 
        m.name_last || ', ' || m.name_first AS player_name, 
        COUNT(s.score_id) AS weeks_played, 
        TOTAL(s.stableford_total) AS stableford_points, 
        TOTAL(s.ctp_points) AS ctp_points, 
        TOTAL(s.birdie_points) AS birdie_points, 
        TOTAL(s.stableford_total + s.ctp_points + s.birdie_points) AS total_points, 
        ROUND(TOTAL(s.stableford_total + s.ctp_points + s.birdie_points) / NULLIF(COUNT(s.score_id), 0), 2) AS avg_points, 
        ROUND(AVG(s.gross_total), 2) AS avg_gross, 
        ROUND(AVG(s.net_total), 2) AS avg_net 
      FROM members m 
      LEFT JOIN scores s ON s.member_id = m.id 
      GROUP BY m.id
    )
    SELECT 
      RANK() OVER (ORDER BY avg_points DESC) AS rank,
      *
    FROM raw_standings
    ORDER BY rank ASC, total_points DESC
  `;

  db.all(standingsSql, [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Database Error");
    }
    res.render("standings", { standings: rows });
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

router.get("/members/:id", (req, res) => {
  const memberId = parseInt(req.params.id, 10);

  // 1. Fetch member basic details
  const memberSql = `SELECT id, name_first, name_last FROM members WHERE id = ?`;

  // 2. Generate weeks 1-5 and LEFT JOIN player scores
  const historySql = `
    WITH RECURSIVE league_weeks(week_number) AS (
      SELECT 1
      UNION ALL
      SELECT week_number + 1 FROM league_weeks WHERE week_number < 5 -- Adjust '5' if your season has more weeks
    )
    SELECT 
      lw.week_number,
      COALESCE(s.score_id, '') AS score_id,
      COALESCE(s.stableford_total, '') AS stableford_total,
      COALESCE(s.ctp_points, '') AS ctp_points,
      COALESCE(s.birdie_points, '') AS birdie_points,
      CASE WHEN s.score_id IS NOT NULL 
           THEN (s.stableford_total + s.ctp_points + s.birdie_points) 
           ELSE '' END AS total_points,
      COALESCE(s.gross_total, '') AS gross_total,
      COALESCE(s.net_total, '') AS net_total
    FROM league_weeks lw
    LEFT JOIN scores s ON s.week_id = lw.week_number AND s.member_id = ?
    ORDER BY lw.week_number ASC
  `;

  db.get(memberSql, [memberId], (err, member) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Database Error");
    }
    if (!member) {
      return res.status(404).send("Player Not Found");
    }

    db.all(historySql, [memberId], (err, scores) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Database Error");
      }

      res.render("profile", {
        member: member,
        scores: scores,
      });
    });
  });
});

router.get("/", authMiddleware, getScores);

export default router;
