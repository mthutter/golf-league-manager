// apply-retroactive-scores.js
import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { buildHoleScores } from "../services/golf.service.js";

// 🟢 PATH RESOLUTION: Resolves database location cleanly from any active folder depth

const dbPath = "../golf-league-db-production.db"; // Adjust to your production path name if different

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error("Direct connection failed:", err);
  else console.log(`Connected directly to local database at: ${dbPath}`);
});

// 🟢 TARGETS: Set the exact member IDs of your newly established players here
const TARGET_PLAYER_IDS = [30]; // 👈 Replace these integers with your actual target member IDs
const COURSE_PAR = 36;

/**
 * Promise wrapper helper for database row lookups
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
 * Promise wrapper helper for database mutations
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
 * Main calculation orchestration script pipeline
 */
// Inside apply-retroactive-scores.js — Replace the inner loop section:

async function runRetroactiveFix() {
  console.log("⛳ Starting retroactive Stableford scoring pass...");
  try {
    const courseHoles = await queryAll(`SELECT * FROM holes ORDER BY hole_number ASC`);
    if (courseHoles.length === 0) {
      throw new Error("No course holes found in database.");
    }

    for (const id of TARGET_PLAYER_IDS) {
      const rows = await queryAll(`SELECT id, name_first, name_last, sex, current_handicap FROM members WHERE id = ?`, [id]);
      if (rows.length === 0) {
        console.log(`⚠️ Player ID ${id} not found. Skipping.`);
        continue;
      }
      const p = rows[0];

      const numericalHandicap = parseFloat(p.current_handicap);
      if (isNaN(numericalHandicap)) {
        console.log(`⚠️ Player ${p.name_first} does not have an established decimal handicap yet. Skipping.`);
        continue;
      }

      console.log(`\n👤 Processing ${p.name_first} ${p.name_last} (Handicap: ${numericalHandicap})`);

      const rounds = await queryAll(
        `
        SELECT * FROM scores 
        WHERE member_id = ? AND gross_total > 0 
        ORDER BY CAST(week_id AS INTEGER) ASC 
        LIMIT 3
      `,
        [id],
      );

      for (const round of rounds) {
        const currentWeekNum = parseInt(round.week_id, 10);
        const startHole = currentWeekNum <= 11 ? 1 : 10;
        const currentNineLabel = startHole === 1 ? "Front 9 (1-9)" : "Back 9 (10-18)";

        let newNetTotal = 0;
        let newStablefordTotal = 0;

        // =================================================================
        // 🛡️ PLUS-HANDICAP PROTECTION LAYER (FOR SCRATCH & PLUS PLAYERS)
        // =================================================================
        if (numericalHandicap < 0) {
          // 1. Isolate absolute index value for stroke calculation
          const absHandicap = Math.abs(numericalHandicap);
          const emulated18Handicap = absHandicap * 2; // e.g. 1.3 * 2 = 2.6

          // Determine baseline plus strokes to add back to the round
          let basePlusStrokes = Math.floor(emulated18Handicap / 18); // 0
          const remainder = emulated18Handicap % 18;

          const sex = (p.sex || "M").toUpperCase();
          const currentNineHoles = courseHoles.filter((h) => h.hole_number >= startHole && h.hole_number < startHole + 9);

          currentNineHoles.forEach((hole) => {
            const gross = parseInt(round[`gross${hole.hole_number}`], 10) || 0;
            if (gross <= 0) return;

            const holeHandicap = sex === "F" ? hole.handicap_women : hole.handicap_men;
            let holeStrokes = basePlusStrokes;

            // Plus golfers owe strokes to the hardest holes first (stroke index 1, 2, 3...)
            if (remainder >= holeHandicap) {
              holeStrokes++;
            }

            // Net score increases for plus handicaps (Gross + Owed Strokes)
            const holeNet = gross + holeStrokes;
            const par = sex === "F" ? hole.par_women : hole.par_men;

            // Calculate Stableford points based on your native stableford matrix rules
            const diff = holeNet - par;
            let holePoints = 0;
            if (diff >= 2) holePoints = 0;
            else if (diff === 1) holePoints = 1;
            else if (diff === 0) holePoints = 2;
            else if (diff === -1) holePoints = 3;
            else if (diff === -2) holePoints = 4;
            else holePoints = 5;

            newNetTotal += holeNet;
            newStablefordTotal += holePoints;
          });
        } else {
          // 🟢 STANDARD PROCESSOR: Runs veteran players through native engine normal rules
          const payload = { ...round, sex: p.sex || "M", handicap_used: numericalHandicap };
          const calculatedHoles = buildHoleScores(payload, courseHoles, startHole);
          newStablefordTotal = calculatedHoles.reduce((acc, h) => acc + (h.points || 0), 0);
          newNetTotal = calculatedHoles.reduce((acc, h) => acc + (h.net || 0), 0);
        }
        // =================================================================

        // Commit the high-precision calculations back to SQLite
        await executeRun(
          `
          UPDATE scores 
          SET 
            handicap_used = ?,
            net_total = ?,
            stableford_total = ?
          WHERE score_id = ?
        `,
          [numericalHandicap, newNetTotal, newStablefordTotal, round.score_id],
        );

        console.log(`   ✅ Week ${round.week_id} [${currentNineLabel}] Adjusted: Gross ${round.gross_total} ➔ Net ${newNetTotal} | Stableford Points: ${newStablefordTotal}`);
      }
    }

    console.log("\n🎯 RETROACTIVE UPDATE COMPLETE! Run your standings generator tool to refresh ranks.");
    process.exit(0);
  } catch (error) {
    console.error("❌ CRITICAL ERROR RUNNING ADJUSTMENT SCRIPT:", error);
    process.exit(1);
  }
}

runRetroactiveFix();
