// services/scores.service.js (PART 1 OF 2)
import db from "../config/db.js";
import logger from "../utilities/logger.js";
import { buildHoleScores } from "./golf.service.js";
import * as weeksService from "./weeks.service.js";

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
 * Compiles a specific week point-in-time standings matrix directly from the members table.
 */
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
 * Builds a week tracker object using active integers safely.
 */
async function getWeek(weekNumber) {
  if (!weekNumber)
    return {
      week_number: 1,
      displayDate: "Week 1",
      date: new Date().toISOString().split("T")[0],
    };

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
// services/scores.service.js (PART 2 OF 2)

/**
 * GET SEASON STANDINGS (MVC Entrypoint)
 */
export const getSeasonStandings = async (selectedWeekNumber = null) => {
  const weeks = await weeksService.getAllWeeks();
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
    selectedWeekId: currentWeekNumber,
    latestWeek,
    biggestUp,
    biggestDown,
  };
};

/**
 * Metadata forms dropdown options population assistant helper
 */
// Inside services/scores.service.js

/**
 * Metadata forms dropdown options population helper.
 * 🟢 FIXED: Automatically isolates the correct 9 holes for the active week
 * and maps player handicap properties to fix the card grids!
 */
export async function getFormData() {
  // 1. Fetch current active target week to determine front vs. back nine rotation splits
  const latestWeekRow = await dbGet(`
    SELECT DISTINCT week_id AS week_number 
    FROM scores 
    ORDER BY CAST(week_id AS INTEGER) DESC 
    LIMIT 1
  `);
  const activeWeekNum = latestWeekRow ? parseInt(latestWeekRow.week_number, 10) : 17;

  // 2. Fetch all active roster members (excluding administrative non-members)
  const rawMembers = await dbAll(`
    SELECT id, name_first, name_last, status, is_non_member, current_handicap 
    FROM members 
    WHERE status != 'No' AND status != 'NO' AND is_non_member != 1
    ORDER BY name_last ASC
  `);

  // 🚀 FRONTEND COMPATIBILITY BRIDGE MAP:
  // Maps 'current_handicap' onto 'handicap' so data-handicap evaluates correctly in EJS!
  const members = rawMembers.map((m) => ({
    id: m.id,
    name_first: m.name_first,
    name_last: m.name_last,
    status: m.status,
    handicap: m.current_handicap !== null && m.current_handicap !== "Provisional" ? parseFloat(m.current_handicap).toFixed(1) : 0, // Fallback to 0 scratch index to prevent Javascript NaN errors
  }));

  // 3. 🚀 MATCH NINES CALENDAR SPLIT FORM LAYOUT RULES:
  // Weeks 1 to 11 pull Front 9 (Holes 1-9). Weeks 12+ pull Back 9 (Holes 10-18).
  let holesQuery = "";
  if (activeWeekNum <= 11) {
    holesQuery = `SELECT * FROM holes WHERE CAST(hole_number AS INTEGER) BETWEEN 1 AND 9 ORDER BY hole_number ASC`;
  } else {
    holesQuery = `SELECT * FROM holes WHERE CAST(hole_number AS INTEGER) BETWEEN 10 AND 18 ORDER BY hole_number ASC`;
  }

  const holes = await dbAll(holesQuery);

  return {
    members,
    holes,
  };
}

/**
 * Persistence layer helper: Inserts a newly submitted round into scores.
 */
export async function createScoreRecord(data) {
  console.log("Score Entered Data: ", data);
  const sql = `
    INSERT INTO scores (member_id, week_id, gross_total, stableford_total, ctp_points, birdie_points, net_total,handicap_used, skins_entered, gross10, gross11, gross12, gross13, gross14, gross15, gross16, gross17, gross18)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  return new Promise((resolve, reject) => {
    db.run(
      sql,
      [
        parseInt(data.memberId, 10),
        parseInt(data.weekId, 10),
        parseInt(data.gross_total, 10),
        parseInt(data.stableford_total, 10),
        parseInt(data.ctp_points, 10) || 0,
        parseInt(data.birdie_points, 10) || 0,
        parseInt(data.net_total, 10) || 0,
        data.handicap || 0,
        data.skins_entered ? 1 : 0,
        data.gross10,
        data.gross11,
        data.gross12,
        data.gross13,
        data.gross14,
        data.gross15,
        data.gross16,
        data.gross17,
        data.gross18,
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
      [parseInt(data.gross_total, 10), parseInt(data.stableford_total, 10), parseInt(data.ctp_points, 10) || 0, parseInt(data.birdie_points, 10) || 0, parseInt(scoreId, 10)],
      (err) => {
        if (err) return reject(err);
        resolve();
      },
    );
  });
}

/**
 * Compiles gross and net values for weekly summary page layouts
 */
// Inside services/scores.service.js

/**
 * Compiles gross, net, and total points values for weekly summary page layouts
 */
export async function getWeeklyBreakdown(weekId) {
  return await dbAll(
    `
    SELECT 
      s.*, 
      (m.name_first || ' ' || m.name_last) AS player_name,
      
      /* 🚀 THE FIX: Dynamically adds your point components together for this specific week */
      (s.stableford_total + s.ctp_points + s.birdie_points) AS total_points
      
    FROM scores s
    LEFT JOIN members m ON s.member_id = m.id
    WHERE CAST(s.week_id AS INTEGER) = CAST(? AS INTEGER)
    ORDER BY (s.stableford_total + s.ctp_points + s.birdie_points) DESC, s.gross_total ASC
  `,
    [weekId],
  );
}

/**
 * Historical profile metrics gatherer for individual player cards.
 * Combines full season schedules with player score cards safely.
 */
export async function getMemberProfileData(memberId) {
  const member = await dbGet(`SELECT *, (name_first || ' ' || name_last) AS full_name FROM members WHERE id = ?`, [memberId]);
  if (!member) return null;

  const activeWeeksRows = await dbAll(`SELECT DISTINCT CAST(week_id AS INTEGER) AS week_number FROM scores ORDER BY week_number ASC`);

  const actualScores = await dbAll(`SELECT *, CAST(week_id AS INTEGER) AS parsed_week FROM scores WHERE member_id = ?`, [memberId]);

  const finalProfileTimelineMatrix = activeWeeksRows.map((weekRow) => {
    const targetWeek = weekRow.week_number;
    const matchedCard = actualScores.find((s) => s.parsed_week === targetWeek);

    if (matchedCard) {
      const stableford = parseFloat(matchedCard.stableford_total) || 0;
      const birdies = parseFloat(matchedCard.birdie_points) || 0;
      const ctp = parseFloat(matchedCard.ctp_points) || 0;

      return {
        week_number: targetWeek,
        score_id: matchedCard.score_id,
        gross_total: matchedCard.gross_total,
        net_total: matchedCard.net_total,
        stableford_total: matchedCard.stableford_total,
        birdie_points: matchedCard.birdie_points,
        ctp_points: matchedCard.ctp_points,
        handicap_used: matchedCard.handicap_used,
        total_points: stableford + birdies + ctp,
      };
    } else {
      return {
        week_number: targetWeek,
        score_id: null,
        gross_total: null,
        net_total: null,
        stableford_total: null,
        birdie_points: null,
        ctp_points: null,
        handicap_used: null,
        total_points: null,
      };
    }
  });

  return {
    member,
    scores: finalProfileTimelineMatrix,
  };
}

/**
 * Reconstructs a complete hole-by-hole round scorecard for the detailed summary view.
 */
export async function getRoundDetails(scoreId) {
  try {
    const scoreRecord = await dbGet(
      `
      SELECT s.*, m.name_first, m.name_last, m.sex, m.current_handicap
      FROM scores s 
      LEFT JOIN members m ON s.member_id = m.id 
      WHERE s.score_id = ?
    `,
      [scoreId],
    );

    if (!scoreRecord) return null;

    const courseHoles = await dbAll(`SELECT * FROM holes ORDER BY hole_number ASC`);
    const currentWeekNum = parseInt(scoreRecord.week_id, 10) || 1;
    const startHole = currentWeekNum <= 11 ? 1 : 10;

    const processedHoles = buildHoleScores(scoreRecord, courseHoles, startHole);

    const totalPar = processedHoles.reduce((acc, h) => acc + (h.par || 0), 0);
    const totalGross = processedHoles.reduce((acc, h) => acc + (h.gross || 0), 0);
    const totalNet = processedHoles.reduce((acc, h) => acc + (h.net || 0), 0);
    const totalPoints = processedHoles.reduce((acc, h) => acc + (h.points || 0), 0);

    const birdies = parseFloat(scoreRecord.birdie_points) || 0;
    const ctp = parseFloat(scoreRecord.ctp_points) || 0;
    const leaguePoints = totalPoints + birdies + ctp;

    return {
      player: {
        id: scoreRecord.member_id,
        displayName: `${scoreRecord.name_first} ${scoreRecord.name_last}`,
      },
      week: {
        number: currentWeekNum,
        displayDate: `Week ${currentWeekNum}`,
      },
      handicapUsed: scoreRecord.current_handicap || "Provisional",
      skinsEntered: !!scoreRecord.skins_entered,
      holes: processedHoles,
      totals: {
        par: totalPar,
        gross: totalGross,
        net: totalNet,
        points: totalPoints,
        stableford: totalPoints,
        birdies: birdies,
        ctp: ctp,
        leaguePoints: leaguePoints,
      },
    };
  } catch (error) {
    logger.error(`Error inside getRoundDetails service layer for card ${scoreId}: ${error.message}`);
    throw error;
  }
}
