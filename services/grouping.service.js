// Import your database helper functions and the raw connection instance
import dbInstance, { all, run } from "../config/db.js";

/*
|--------------------------------------------------------------------------
| Groupings Service (SQLite3 Driver Edition - Constraint Patched)
|--------------------------------------------------------------------------
*/

// Helper: Fisher-Yates array shuffle algorithm
function shuffle(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Retrieves a finalized tee time schedule for a specific week,
 * dynamically merging name_first and name_last into a single 'name' field.
 */
export const getGroupingsForWeek = async (weekId) => {
  try {
    const sql = `
            SELECT g.id, g.week_id, g.tee_time, g.group_number, g.position, g.member_id,
                   (m.name_first || ' ' || m.name_last) AS name
            FROM groupings g
            LEFT JOIN members m ON g.member_id = m.id
            WHERE g.week_id = ?
            ORDER BY g.group_number ASC, g.position ASC
        `;

    const rows = await all(sql, [weekId]);

    // Rebuild the 4 groups from the individual positional rows
    const groupMap = {};
    const assignedMemberIds = [];

    rows.forEach((row) => {
      assignedMemberIds.push(row.member_id);

      if (!groupMap[row.group_number]) {
        groupMap[row.group_number] = {
          teeTime: row.tee_time,
          groupNumber: row.group_number,
          players: [],
        };
      }

      groupMap[row.group_number].players.push({
        position: row.position,
        memberId: row.member_id,
        name: row.name || "Vacant",
      });
    });

    // Find who was left out by comparing ALL active regular members against assigned IDs
    const allRegularSql = `
            SELECT id, (name_first || ' ' || name_last) AS name 
            FROM members 
            WHERE status = 'Yes' and type = 'Regular'
        `;
    const allRegularMembers = await all(allRegularSql);

    const outPlayers = allRegularMembers.filter((member) => !assignedMemberIds.includes(member.id));

    return {
      groupings: Object.values(groupMap),
      outPlayers: outPlayers,
    };
  } catch (err) {
    throw new Error(`Failed to retrieve groupings: ${err.message}`);
  }
};

/**
 * Generates completely randomized groups for a given week using your 4 time slots.
 * Captures name strings correctly using string concatenation.
 */
export const generateRandomGroupings = async (weekId) => {
  try {
    const memberSql = `
            SELECT id, (name_first || ' ' || name_last) AS name 
            FROM members 
            WHERE status = 'Yes' and type = 'Regular'
        `;
    const members = await all(memberSql);

    if (members.length === 0) {
      throw new Error("No active regular members found to assign.");
    }

    await deleteGroupingsForWeek(weekId);
    const randomizedMembers = shuffle(members);

    const teeTimes = ["4:50pm", "5:00pm", "5:10pm", "5:20pm"];
    const dbRowsToInsert = [];
    let currentMemberIndex = 0;

    // Build up the 4 groups position-by-position (max 16 players)
    for (let gIdx = 0; gIdx < teeTimes.length; gIdx++) {
      const groupNum = gIdx + 1;
      const timeSlot = teeTimes[gIdx];

      for (let pos = 1; pos <= 4; pos++) {
        if (currentMemberIndex >= 16 || currentMemberIndex >= randomizedMembers.length) break;

        const member = randomizedMembers[currentMemberIndex];

        dbRowsToInsert.push({
          week_id: weekId,
          tee_time: timeSlot,
          group_number: groupNum,
          member_id: member.id,
          position: pos,
        });

        currentMemberIndex++;
      }
    }

    // Bulk save calculated rows to the SQLite database
    if (dbRowsToInsert.length > 0) {
      await saveGroupings(weekId, dbRowsToInsert);
    }

    // Capture players left over after index 16
    const outPlayers = randomizedMembers.slice(currentMemberIndex);

    return { dbRowsToInsert, outPlayers };
  } catch (err) {
    throw new Error(`Failed to generate random groupings: ${err.message}`);
  }
};

/**
 * Commits an array of individual member positions to your SQLite DB.
 */
export const saveGroupings = (weekId, rows) => {
  return new Promise((resolve, reject) => {
    const sql = `
            INSERT INTO groupings (week_id, tee_time, group_number, member_id, position)
            VALUES (?, ?, ?, ?, ?)
        `;

    dbInstance.serialize(() => {
      dbInstance.run("BEGIN TRANSACTION;");

      const stmt = dbInstance.prepare(sql, (err) => {
        if (err) {
          dbInstance.run("ROLLBACK;");
          return reject(new Error(`Failed to prepare insert statement: ${err.message}`));
        }
      });

      rows.forEach((row) => {
        stmt.run(row.week_id, row.tee_time, row.group_number, row.member_id, row.position, (err) => {
          if (err) {
            dbInstance.run("ROLLBACK;");
            return reject(new Error(`Failed insertion step: ${err.message}`));
          }
        });
      });

      stmt.finalize((err) => {
        if (err) {
          dbInstance.run("ROLLBACK;");
          return reject(new Error(`Failed to finalize insert: ${err.message}`));
        }

        dbInstance.run("COMMIT;", (commitErr) => {
          if (commitErr) {
            return reject(new Error(`Transaction commit failed: ${commitErr.message}`));
          }
          console.log(`Successfully saved ${rows.length} rows for week ${weekId}`);
          resolve(true);
        });
      });
    });
  });
};

/**
 * Deletes any existing groupings for a week.
 */
export const deleteGroupingsForWeek = async (weekId) => {
  try {
    const sql = `DELETE FROM groupings WHERE week_id = ?`;
    await run(sql, [weekId]);
    console.log(`Cleared old records for week ${weekId}`);
    return true;
  } catch (err) {
    throw new Error(`Failed to clear old records: ${err.message}`);
  }
};

/**
 * Swaps two players' database slots for a given week safely.
 */
export const swapPlayerPositions = (weekId, p1, p2) => {
  return new Promise((resolve, reject) => {
    dbInstance.serialize(() => {
      // 🛠️ THE MASTER FIX: Defer foreign key/unique verification checks 
      // until the entire transaction block commits. This stops SQLite from crashing mid-swap!
      dbInstance.run("PRAGMA defer_foreign_keys = ON;");
      dbInstance.run("BEGIN TRANSACTION;");

      try {
        // Scenario A: Both players are currently on the grid
        if (p1.groupNumber && p2.groupNumber) {
          const bulkUpdateSql = `
              UPDATE groupings
              SET member_id = CASE 
                  WHEN group_number = ? AND position = ? THEN ?
                  WHEN group_number = ? AND position = ? THEN ?
              END
              WHERE week_id = ? 
                AND ((group_number = ? AND position = ?) OR (group_number = ? AND position = ?))
          `;

          dbInstance.run(bulkUpdateSql, [
              p1.groupNumber, p1.position, p2.memberId, 
              p2.groupNumber, p2.position, p1.memberId, 
              weekId,
              p1.groupNumber, p1.position,
              p2.groupNumber, p2.position
          ], function(err) {
              if (err) throw err;
          });
        } 
        // Scenario B: One player is on the grid, and one is sitting out ("Out list")
        else if (p1.groupNumber || p2.groupNumber) {
          const gridPlayer = p1.groupNumber ? p1 : p2;
          const outPlayer = p1.groupNumber ? p2 : p1;

          const updateGridSql = `
              UPDATE groupings 
              SET member_id = ? 
              WHERE week_id = ? AND group_number = ? AND position = ?
          `;
          
          dbInstance.run(updateGridSql, [
              outPlayer.memberId, 
              weekId, 
              gridPlayer.groupNumber, 
              gridPlayer.position
          ], function(err) {
              if (err) throw err;
          });
        }

        dbInstance.run("COMMIT;", (commitErr) => {
          if (commitErr) {
            dbInstance.run("ROLLBACK;");
            return reject(commitErr);
          }
          console.log(`Successfully swapped member ${p1.memberId} and ${p2.memberId} for week ${weekId}`);
          resolve(true);
        });

      } catch (err) {
        dbInstance.run("ROLLBACK;");
        reject(err);
      }
    });
  });
};
