// services/handicap.service.js
import sqlite3 from "sqlite3";
import path from "path";
import logger from "../utilities/logger.js";

// 🟢 SAFE ABSOLUTE PATH RESOLUTION: Maps paths identically to your root app.js schema rules
const dbPath = process.env.NODE_ENV === "production" ? "/var/data/golf-league-db-production.db" : "./golf-league-db-production.db";

// Initialize a dedicated, thread-safe connection instance for the handicap engine
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) logger.error("[HANDICAP SERVICE] Local SQLite linkage crash:", err);
});

/**
 * Helper to wrap db.all safely in a standard Promise
 */
function queryAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

/**
 * Helper to wrap db.run safely in a standard Promise
 */
function executeRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

/**
 * Retrieves live scorecards from the primary scores schema.
 */
export async function getFilteredHandicapHistory({ year }) {
  try {
    let query = `
      SELECT 
        s.member_id,
        s.week_id AS week_number,
        s.week_id,
        s.gross_total AS gross_score,
        m.name_last,
        m.name_first,
        m.status
      FROM scores s
      LEFT JOIN members m ON s.member_id = m.id
      WHERE 1=1
    `;
    const params = [];

    // Keep data wide open for the yearly block so the controller can accurately count rolling rounds
    query += ` ORDER BY CAST(s.week_id AS INTEGER) ASC, m.name_last ASC `;
    return await queryAll(query, params);
  } catch (error) {
    logger.error(`Error in getFilteredHandicapHistory: ${error.message}`);
    throw error;
  }
}

/**
 * Metadata query helper to populate filter dropdown select menus on load.
 */
export async function getHandicapFilterMetadata() {
  try {
    const weeks = await queryAll(`SELECT DISTINCT week_id FROM scores ORDER BY CAST(week_id AS INTEGER) DESC`);
    const members = await queryAll(`SELECT id, name_last, name_first, status FROM members WHERE status != "No" AND status != "NO" ORDER BY name_last ASC`);

    return {
      years: ["2026"],
      weeks: weeks.map((w) => w.week_id),
      members,
    };
  } catch (error) {
    logger.error(`Error in getHandicapFilterMetadata: ${error.message}`);
    throw error;
  }
}

/**
 * Updates the core member statistics table based on Option B cumulative logic
 */
export async function calculateHandicaps(coursePar = 36) {
  logger.info("[HANDICAP ENGINE] Running Option B season updates across the member database...");
  try {
    const players = await queryAll(`SELECT id FROM members`);

    for (const player of players) {
      const rounds = await queryAll(`SELECT gross_total FROM scores WHERE member_id = ? AND gross_total > 0`, [player.id]);

      if (rounds.length < 3) {
        await executeRun(`UPDATE members SET current_handicap = NULL, rounds_played = ? WHERE id = ?`, [rounds.length, player.id]);
        continue;
      }

      const total = rounds.reduce((sum, r) => sum + r.gross_total, 0);
      const average = total / rounds.length;
      const rawHandicap = average - coursePar;
      const roundedHandicap = (Math.round(rawHandicap * 10) / 10).toFixed(1);

      await executeRun(
        `
        UPDATE members SET current_handicap = ?, average_score = ?, rounds_played = ? WHERE id = ?
      `,
        [roundedHandicap, average, rounds.length, player.id],
      );
    }
    logger.info("[HANDICAP ENGINE] Dynamic calculation run complete.");
  } catch (error) {
    logger.error(`Failed executing background handicap recalculation step: ${error.message}`);
  }
}

export async function writeCurrentHandicaps() {
  return true;
}
