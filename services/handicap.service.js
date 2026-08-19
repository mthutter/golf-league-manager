import db, { all, run } from "../config/db.js";
import { getCurrentWeekPlayed } from "./weeks.service.js";
import logger from "../utilities/logger.js";

export async function writeCurrentHandicaps() {
  logger.info("[HANDICAP ENGINE] Recalculating player handicaps...");

  const weekResult = await getCurrentWeekPlayed();

  // Safely parse the structure {"week_number": 15}
  const currentWeek = weekResult && typeof weekResult === "object" ? weekResult.week_number : weekResult;

  logger.info(`Parsed currentWeek value to insert: ${currentWeek}`);

  if (currentWeek === undefined || currentWeek === null) {
    throw new Error("Cannot proceed: week_number calculation failed or returned null.");
  }

  return new Promise((resolve, reject) => {
    db.all(`SELECT id, current_handicap FROM members`, [], (err, rows) => {
      if (err) {
        logger.error("Error reading members:", err.message);
        return reject(err);
      }

      const totalRows = rows.length;
      if (totalRows === 0) {
        logger.info("No member rows found to process.");
        return resolve();
      }

      let completed = 0;
      const insertSql = `INSERT INTO handicap_history (member_id, week_id, year, handicap) VALUES (?, ?, ?, ?)`;

      function checkCompletion() {
        completed++;
        if (completed === totalRows) {
          logger.info("All handicap records written successfully.");
          resolve();
        }
      }

      rows.forEach((row) => {
        if (row.current_handicap === null || row.current_handicap === undefined) {
          checkCompletion();
          return;
        }

        // Pass variables sequentially into SQLite
        db.run(insertSql, [row.id, currentWeek, "2026", row.current_handicap], function (insertErr) {
          if (insertErr) {
            // Real SQL errors (like NOT NULL constraints) will print properly here now
            logger.error(`Error inserting row for ID ${row.id}: ${insertErr.message}`);
          } else {
            logger.info(`Inserted row with ID: ${this.lastID} for member ${row.id}`);
          }
          checkCompletion();
        });
      });
    });
  });
}

export async function calculateHandicaps(coursePar = 36) {
  const players = await all(`
    SELECT
      id,
      name_last,
      handicap
    FROM members
  `);

  for (const player of players) {
    const rounds = await all(
      `
      SELECT gross_total AS total_score
      FROM scores
      WHERE member_id = ?
      `,
      [player.id],
    );

    // Skip players with no rounds entered
    if (rounds.length === 0) {
      continue;
    }

    // New players (no carry-over handicap) need 3 rounds
    const isNewPlayer = player.handicap == null;

    if (isNewPlayer && rounds.length < 3) {
      continue;
    }

    const total = rounds.reduce((sum, r) => sum + r.total_score, 0);

    console.log("Total: ", total);

    const average = total / rounds.length;
    const handicap = Math.round(average - coursePar);
    console.log("Average: ", average);
    console.log("Handicap: ", handicap);

    logger.info(`${player.name_last}: avg=${average.toFixed(2)} hcp=${handicap} rnds=${rounds.length}`);

    await run(
      `
      UPDATE members
      SET current_handicap = ?
      WHERE id = ?
      `,
      [handicap, player.id],
    );

    await run(
      `
      UPDATE members
      SET average_score = ?
      WHERE id = ?
      `,
      [average, player.id],
    );

    await run(
      `
      UPDATE members
      SET rounds_played = ?
      WHERE id = ?
      `,
      [rounds.length, player.id],
    );
  }
}

/**
 * Retrieves dynamic filtered handicap data based on UI parameters.
 * Allows filtering by specific year, week, or unique player member ID.
 */
export async function getFilteredHandicapHistory({ year, weekId, memberId }) {
  try {
    let query = `
            SELECT hh.member_id, hh.week_id, hh.handicap, hh.year, m.name_last, m.name_first
            FROM handicap_history hh
            LEFT JOIN members m ON hh.member_id = m.id
            WHERE 1=1
        `;
    const params = [];

    if (year) {
      query += ` AND hh.year = ? `;
      params.push(year);
    }
    if (weekId) {
      query += ` AND hh.week_id = ? `;
      params.push(parseInt(weekId, 10));
    }
    if (memberId) {
      query += ` AND hh.member_id = ? `;
      params.push(parseInt(memberId, 10));
    }

    // Sort sequentially by week, then handicap value, then alphabetical names
    query += ` ORDER BY hh.week_id DESC, hh.handicap ASC, m.name_last ASC `;

    return await all(query, params);
  } catch (error) {
    logger.error(`Error in getFilteredHandicapHistory: ${error.message}`);
    throw error;
  }
}

/**
 * Metadata query helper to populate filter dropdown select menus on load.
 */
export async function getHandicapFilterMetadata() {
  const years = await all(`SELECT DISTINCT year FROM handicap_history ORDER BY year DESC`);
  const weeks = await all(`SELECT DISTINCT week_id FROM handicap_history ORDER BY week_id DESC`);
  const members = await all(`SELECT id, name_last, name_first FROM members WHERE status != "No" ORDER BY name_last ASC`);

  return {
    years: years.map((y) => y.year),
    weeks: weeks.map((w) => w.week_id),
    members,
  };
}
