import db from "../config/db.js";

export function showWeeklyScoresForm(req, res) {
  res.render("weekly-scores-form", { members });
}

/* =========================================
   GET ALL SCORES
========================================= */

export function getScores(req, res) {
  const sql = `
    SELECT *
    FROM scores
    ORDER BY week_id ASC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("Database Error:", err.message);

      return res.status(500).render("error", {
        message: "Unable to retrieve scores.",
      });
    }

    res.render("scores", {
      scores: rows,
    });
  });
}
