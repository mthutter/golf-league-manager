import db, {
    all,
    run
} from "../config/db.js";
import {
    getCurrentWeekPlayed
} from "./weeks.service.js";
import logger from "../utilities/logger.js";

export async function writeCurrentHandicaps() {
    // 1. Keep await ONLY for your week service if it returns a promise
    const weekResult = await getCurrentWeekPlayed();
    const currentWeek = weekResult?.week_number;
    logger.info("Current week: ", currentWeek);

    if (currentWeek === undefined || currentWeek === null) {
        throw new Error("Cannot proceed: week_number is missing or undefined.");
    }

    // 2. Pure native sqlite3 callback chain
    db.all(`SELECT id, current_handicap FROM members`, [], (err, rows) => {
        if (err) {
            logger.error("Error reading members:", err.message);
            return;
        }

        // Track processing to know when it is safe to close the database
        let completed = 0;
        const totalRows = rows.length;

        if (totalRows === 0) {
            logger.info("No member rows found to process.");
            closeDatabase();
            return;
        }

        const insertSql = `INSERT INTO handicap_history (id, week_id, handicap) VALUES (?, ?, ?)`;

        // 3. Process every row sequentially
        rows.forEach((row) => {
            if (row.current_handicap === null || row.current_handicap === undefined) {
                checkCompletion(); // Skip if no handicap, but count it as handled
                return;
            }

            // NOTE: Use regular 'function(err)' here so 'this.lastID' is available
            db.run(
                insertSql,
                [row.id, currentWeek, "2026", row.current_handicap],
                function(insertErr) {
                    if (insertErr) {
                        logger.error(
                            `Error inserting row for ID ${row.id}:`,
                            insertErr.message,
                        );
                    } else {
                        logger.info(`Inserted row with ID: ${this.lastID}`);
                    }
                    checkCompletion();
                },
            );
        });

        // Helper function to safely track async insertion progress
        function checkCompletion() {
            completed++;
            if (completed === totalRows) {
                logger.info(`Successfully completed iteration over ${completed} rows.`);
            }
        }
    });
}

// 4. Standalone connection cleanup function
function closeDatabase() {
    db.close((closeErr) => {
        if (closeErr) {
            logger.error("Error closing database:", closeErr.message);
        } else {
            logger.info("Database connection closed cleanly.");
        }
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

        logger.info(
            `${player.name_last}: avg=${average.toFixed(2)} hcp=${handicap} rnds=${rounds.length}`,
        );

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