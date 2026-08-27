// services/scores.service.js
import db from "../config/db.js";
import logger from "../utilities/logger.js";

/**
 * Custom promise wrapper helper for db.all lookups
 */
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

/**
 * Custom promise wrapper helper for db.get lookups
 */
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

/**
 * Compiles a specific week point-in-time standings matrix directly from history snapshots.
 * Employs 'calculated_handicap' to stop SQLite from overriding floats with legacy columns.
 */

// Inside services/scores.service.js

async function getStandingsThroughWeek(weekNumber) {
  const sql = `
    WITH raw_standings AS (
      SELECT 
        m.id, 
        m.status, 
        m.name_last || ', ' || m.name_first AS player_name, 
        m.standings_exempt, 
        COUNT(s.score_id) AS weeks_played, 
        TOTAL(s.stableford_total) AS stableford_points, 
        TOTAL(s.ctp_points) AS ctp_points, 
        TOTAL(s.birdie_points) AS birdie_points, 
        TOTAL(s.stableford_total + s.ctp_points + s.birdie_points) AS total_points, 
        ROUND(
          TOTAL(s.stableford_total + s.ctp_points + s.birdie_points) / NULLIF(COUNT(s.score_id), 0), 
          2
        ) AS avg_points, 
        ROUND(AVG(s.gross_total), 2) AS avg_gross, 
        ROUND(AVG(s.net_total), 2) AS avg_net,
        
        /* 🚀 THE SOLUTION: Read your flawless decimal strings directly from the members table! */
        COALESCE(m.current_handicap, 'Provisional') AS current_handicap
         
      FROM members m 
      LEFT JOIN scores s ON s.member_id = m.id AND CAST(s.week_id AS INTEGER) <= CAST(? AS INTEGER) 
      WHERE m.is_non_member = 0 
      GROUP BY m.id
    ) 
    SELECT 
      CASE 
        WHEN standings_exempt = 1 THEN NULL 
        ELSE RANK() OVER ( PARTITION BY standings_exempt ORDER BY avg_points DESC ) 
      END AS rank, 
      * 
    FROM raw_standings 
    ORDER BY standings_exempt ASC, rank ASC, total_points DESC
  `;

  return await dbAll(sql, [weekNumber]);
}

/**
 * Reads unique weeks directly from live score records to bypass missing table crashes.
 */
async function getAllWeeks() {
  const rows = await dbAll(`
    SELECT DISTINCT week_id AS week_number 
    FROM scores 
    ORDER BY CAST(week_id AS INTEGER) ASC
  `);

  return rows.map((row) => ({
    week_number: row.week_number,
    displayDate: `Week ${row.week_number}`,
    date: new Date().toISOString().split("T")[0],
  }));
}

/**
 * Builds a week tracker object using active integers safely.
 */
async function getWeek(weekNumber) {
  if (!weekNumber) return { week_number: 1, displayDate: "Week 1", date: new Date().toISOString().split("T")[0] };

  return {
    week_number: parseInt(weekNumber, 10),
    displayDate: `Week ${weekNumber}`,
    date: new Date().toISOString().split("T")[0],
  };
}

/**
 * Standardizes previous week tracking math safely.
 */
async function getPreviousWeekPlayed(currentWeekNumber) {
  const prevWeek = parseInt(currentWeekNumber, 10) - 1;
  return { week_number: prevWeek > 0 ? prevWeek : 1 };
}

/**
 * Locates the current active target week identification integer
 */
async function getCurrentWeekPlayed() {
  const row = await dbGet(`SELECT DISTINCT week_id AS week_number FROM scores ORDER BY CAST(week_id AS INTEGER) DESC LIMIT 1`);
  return row || { week_number: 1 };
}

/**
 * GET SEASON STANDINGS (MVC Entrypoint)
 * Processes parameter filters, evaluates position rank trends, and locks true decimals.
 */
export const getSeasonStandings = async (selectedWeekNumber = null) => {
  const weeks = await getAllWeeks();
  const latestWeekPlayed = await getCurrentWeekPlayed();
  const latestWeek = await getWeek(latestWeekPlayed.week_number);

  if (latestWeek?.date) {
    latestWeek.displayDate = new Date(latestWeek.date + "T12:00:00").toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });
  }

  const currentWeekNumber = selectedWeekNumber || latestWeekPlayed.week_number;
  const previousWeekPlayed = await getPreviousWeekPlayed(currentWeekNumber);
  const currentWeek = await getWeek(currentWeekNumber);

  if (currentWeek && currentWeek.date) {
    currentWeek.displayDate = new Date(currentWeek.date + "T12:00:00").toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });
  }

  // Fetch historic standings datasets
  const standings = await getStandingsThroughWeek(currentWeekNumber);
  const previousStandings = await getStandingsThroughWeek(previousWeekPlayed.week_number);

  const previousRanks = {};
  previousStandings.forEach((player) => {
    previousRanks[player.id] = player.rank;
  });

  standings.forEach((player) => {
    const previousRank = previousRanks[player.id];
    if (!previousRank) {
      player.movement = "new";
      player.delta = 0;
      return;
    }
    const diff = previousRank - player.rank;
    if (diff > 0) {
      player.movement = "up";
      player.delta = diff;
    } else if (diff < 0) {
      player.movement = "down";
      player.delta = Math.abs(diff);
    } else {
      player.movement = "same";
      player.delta = 0;
    }
  });

  // =================================================================
  // 🟢 FIXED RE-MAPPING PROPERTY PROTECTION OVERRIDE LOOP
  // Prioritizes our custom virtual key to clear SQLite precedence bugs
  // =================================================================
  if (standings && standings.length > 0) {
    standings.forEach((player) => {
      const hcp = player.current_handicap;
      if (hcp && hcp !== "Provisional" && !isNaN(hcp)) {
        player.current_handicap = parseFloat(hcp).toFixed(1);
      } else if (!hcp || String(hcp).trim() === "") {
        player.current_handicap = "Provisional";
      }
    });
  }
  // =================================================================

  const biggestUp = standings
    .filter((p) => p.movement === "up")
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);

  const biggestDown = standings
    .filter((p) => p.movement === "down")
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);

  return {
    standings,
    weeks,
    currentWeek,
    selectedWeek: currentWeekNumber,
    latestWeek,
    biggestUp,
    biggestDown,
  };
};

/**
 * Metadata forms dropdown options population assistant helper
 */
export async function getFormData() {
  const members = await dbAll(`SELECT id, name_first, name_last, status FROM members ORDER BY name_last ASC`);
  return { members, holes: Array.from({ length: 9 }, (_, i) => i + 1) };
}

/**
 * Persistence layer helper: Inserts a newly submitted round into scores.
 */
export async function createScoreRecord(data) {
  const sql = `
    INSERT INTO scores (member_id, week_id, gross_total, stableford_total, ctp_points, birdie_points, year)
    VALUES (?, ?, ?, ?, ?, ?, '2026')
  `;
  return new Promise((resolve, reject) => {
    db.run(
      sql,
      [
        parseInt(data.memberId, 10),
        parseInt(data.weekId, 10),
        parseInt(data.grossTotal, 10),
        parseInt(data.stablefordTotal, 10),
        parseInt(data.ctpPoints, 10) || 0,
        parseInt(data.birdiePoints, 10) || 0,
      ],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      },
    );
  });
}

/**
 * Persistence layer helper: Modifies a round entry inside scores.
 */
export async function updateScoreRecord(scoreId, data) {
  const sql = `
    UPDATE scores 
    SET gross_total = ?, stableford_total = ?, ctp_points = ?, birdie_points = ?
    WHERE score_id = ?
  `;
  return new Promise((resolve, reject) => {
    db.run(
      sql,
      [parseInt(data.grossTotal, 10), parseInt(data.stablefordTotal, 10), parseInt(data.ctpPoints, 10) || 0, parseInt(data.birdiePoints, 10) || 0, parseInt(scoreId, 10)],
      (err) => {
        if (err) return reject(err);
        resolve();
      },
    );
  });
}

/**
 * Gathers hole-to-hole performance breakdown specs for matching cards
 */
export async function getRoundDetails(scoreId) {
  return await dbGet(
    `
    SELECT s.*, m.name_first, m.name_last 
    FROM scores s 
    LEFT JOIN members m ON s.member_id = m.id 
    WHERE s.score_id = ?
  `,
    [scoreId],
  );
}

/**
 * Compiles gross and net values for weekly summary page layouts
 */
export async function getWeeklyBreakdown(weekId) {
  return await dbAll(
    `
    SELECT s.*, (m.name_first || ' ' || m.name_last) AS player_name 
    FROM scores s
    LEFT JOIN members m ON s.member_id = m.id
    WHERE CAST(s.week_id AS INTEGER) = CAST(? AS INTEGER)
    ORDER BY s.stableford_total DESC, s.gross_total ASC
  `,
    [weekId],
  );
}

/**
 * Historical profile metrics gatherer for individual player cards
 */
export async function getMemberProfileData(memberId) {
  const member = await dbGet(`SELECT *, (name_first || ' ' || name_last) AS full_name FROM members WHERE id = ?`, [memberId]);
  if (!member) return null;

  const rounds = await dbAll(`SELECT * FROM scores WHERE member_id = ? ORDER BY CAST(week_id AS INTEGER) DESC`, [memberId]);
  return { member, rounds };
}
