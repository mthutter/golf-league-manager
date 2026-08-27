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
// Inside services/handicap.service.js

// Inside services/handicap.service.js

export async function calculateHandicaps(coursePar = 36) {
  logger.info("[HANDICAP ENGINE] Running administrative Option B recalculation pass...");
  try {
    // 1. Fetch all distinct members from the roster
    const players = await queryAll(`SELECT id, name_last, name_first FROM members`);

    for (const player of players) {
      const playerId = parseInt(player.id, 10); // 🟢 Safe Integer Type Extraction
      if (isNaN(playerId)) continue;

      // 2. Fetch all valid round scores for this individual player
      const rounds = await queryAll(`SELECT gross_total FROM scores WHERE member_id = ? AND gross_total > 0`, [playerId]);

      // Handle players with insufficient data (fewer than 3 rounds)
      if (rounds.length < 3) {
        logger.info(`Player ${player.name_first} ${player.name_last} remains Provisional (Rounds: ${rounds.length})`);
        await executeRun(`UPDATE members SET current_handicap = NULL, rounds_played = ? WHERE id = ?`, [rounds.length, playerId]);
        continue;
      }

      // 3. OPTION B REAL-TIME MATHEMATICAL COMPILATION ENGINE
      const totalStrokes = rounds.reduce((sum, r) => sum + parseFloat(r.gross_total), 0);
      const average = totalStrokes / rounds.length;
      const rawHandicap = average - coursePar;

      // 🧮 Pure Option B Precision Guard: Mirrors your working EJS history charts
      const roundedValue = Math.round(rawHandicap * 10) / 10;
      const finalDecimalHandicap = roundedValue.toFixed(1); // Exactly "12.1", "10.7", etc.

      // 4. PERSIST DIRECTLY TO THE MEMBERS TABLE USING TEXT CAST PROTECTION
      // 🟢 The Cast Forces SQLite to accept the literal string format bypassing column definitions
      await executeRun(
        `
        UPDATE members 
        SET 
          current_handicap = CAST(? AS TEXT), 
          average_score = ?, 
          rounds_played = ? 
        WHERE id = ?
      `,
        [finalDecimalHandicap, average, rounds.length, playerId],
      );

      logger.info(`Successfully updated ${player.name_first} ${player.name_last}: Hcp = ${finalDecimalHandicap}`);
    }

    logger.info("[HANDICAP ENGINE] Success: Members table synchronized with Option B true decimals.");
  } catch (error) {
    logger.error(`Failed executing background handicap recalculation step: ${error.message}`);
    throw error;
  }
}

export async function writeCurrentHandicaps() {
  return true;
}
