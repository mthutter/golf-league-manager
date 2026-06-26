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
/**
 * Retrieves a finalized tee time schedule for a specific week,
 * dynamically calculating unassigned regular players and available substitutes.
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
      if (row.member_id && row.member_id !== 0) {
        assignedMemberIds.push(row.member_id);
      }

      if (!groupMap[row.group_number]) {
        groupMap[row.group_number] = {
          teeTime: row.tee_time,
          groupNumber: row.group_number,
          players: [],
        };
      }

      // Only push if a valid member exists, otherwise let it render as empty/vacant
      if (row.member_id) {
        groupMap[row.group_number].players.push({
          position: row.position,
          memberId: row.member_id,
          name: row.name || "Vacant",
        });
      }
    });

    // 1. Fetch ALL active members (both regulars and substitutes)
    const allActiveSql = `
        SELECT id, (name_first || ' ' || name_last) AS name, type 
        FROM members 
        WHERE status = 'Yes'
    `;
    const allActiveMembers = await all(allActiveSql);

    // 2. Filter out anyone who is already assigned a tee time on the grid
    const unassignedPool = allActiveMembers.filter((member) => !assignedMemberIds.includes(member.id));

    // 3. Split the unassigned pool into Regulars (Out) and Substitutes
    const outPlayers = unassignedPool.filter((member) => member.type === "Regular");
    const subPlayers = unassignedPool.filter((member) => member.type === "Substitute");
    console.log("Out Players: ", outPlayers);
    console.log("Subs: ", subPlayers);
    return {
      groupings: Object.values(groupMap),
      outPlayers: outPlayers,
      subPlayers: subPlayers,
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
export const swapPlayerPositions = async (weekId, p1, p2) => {
  try {
    const updateSql = `
            UPDATE groupings 
            SET member_id = ? 
            WHERE week_id = ? AND group_number = ? AND position = ?
        `;

    // Scenario A: Both players are currently on the grid (Standard Swap)
    if (p1.groupNumber && p2.groupNumber) {
      const tempP1 = -1;
      const tempP2 = -2;

      await run(updateSql, [tempP1, weekId, p1.groupNumber, p1.position]);
      await run(updateSql, [tempP2, weekId, p2.groupNumber, p2.position]);

      await run(updateSql, [p2.memberId, weekId, p1.groupNumber, p1.position]);
      await run(updateSql, [p1.memberId, weekId, p2.groupNumber, p2.position]);
    }

    // Scenario B1: Dragging a Sub/Out player onto an OCCUPIED grid cell
    else if (p1.groupNumber && p2.memberId && !p2.groupNumber) {
      await run(updateSql, [-99, weekId, p1.groupNumber, p1.position]);
      await run(updateSql, [p2.memberId, weekId, p1.groupNumber, p1.position]);
    }
    // Scenario B2: Dragging a Sub/Out player onto an OCCUPIED grid cell (reverse direction)
    else if (p2.groupNumber && p1.memberId && !p1.groupNumber) {
      await run(updateSql, [-99, weekId, p2.groupNumber, p2.position]);
      await run(updateSql, [p1.memberId, weekId, p2.groupNumber, p2.position]);
    }

    // 🎯 NEW SCENARIO C: Dragging a player OUT of the grid and dropping them into an unassigned Pool
    // Sets the slot value to 0 to satisfy the database table's NOT NULL constraint!
    else if (p1.groupNumber && !p2.groupNumber && !p2.memberId) {
      await run(updateSql, [0, weekId, p1.groupNumber, p1.position]);
    } else if (p2.groupNumber && !p1.groupNumber && !p1.memberId) {
      await run(updateSql, [0, weekId, p2.groupNumber, p2.position]);
    }

    console.log(`Successfully completed manual database grid structural sync for week ${weekId}`);
    return true;
  } catch (err) {
    console.error("Database execution error during swap:", err.message);
    throw new Error(`Failed to execute swap: ${err.message}`);
  }
};
