import db from "../config/db.js";
import {
  getAllWeeks,
  getCurrentWeekPlayed,
  getPreviousWeekPlayed,
  getWeek,
} from "./weeks.service.js";

// --- Promise Helpers for SQLite Callbacks ---
const dbAll = (sql, params = []) =>
  new Promise((res, rej) =>
    db.all(sql, params, (e, r) => (e ? rej(e) : res(r))),
  );
const dbGet = (sql, params = []) =>
  new Promise((res, rej) =>
    db.get(sql, params, (e, r) => (e ? rej(e) : res(r))),
  );
const dbRun = (sql, params = []) =>
  new Promise((res, rej) =>
    db.run(sql, params, function (e) {
      e ? rej(e) : res(this);
    }),
  );

/**
 * Fetches initial data needed to construct the score form
 */
export const getFormData = async () => {
  const memberSql = `
  SELECT
    id,
    name_first,
    name_last,
    COALESCE(current_handicap, handicap) AS handicap
  FROM members
  ORDER BY name_last, name_first
`;
  const holesSql = `SELECT * FROM holes WHERE hole_number <= 9 ORDER BY hole_number`;

  const [members, holes] = await Promise.all([
    dbAll(memberSql),
    dbAll(holesSql),
  ]);

  return { members, holes };
};

/**
 * Inserts scoring record from a request payload
 */
export const createScoreRecord = async (body) => {
  const sql = `
    INSERT INTO scores (
      week_id, member_id, handicap_used, ctp_points, birdie_points, 
      gross1, gross2, gross3, gross4, gross5, gross6, gross7, gross8, gross9, 
      gross_total, net_total, stableford_total
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `;
  const params = [
    body.weekId,
    body.memberId,
    body.handicap,
    body.ctp_points,
    body.birdie_points,
    body.gross1,
    body.gross2,
    body.gross3,
    body.gross4,
    body.gross5,
    body.gross6,
    body.gross7,
    body.gross8,
    body.gross9,
    body.gross_total,
    body.net_total,
    body.stableford_total,
  ];
  return dbRun(sql, params);
};

/**
 * Fetches season standings and maps localized dates
 */
export const getSeasonStandings = async () => {
  console.log("getSeasonStandings() running");

  const weeks = await getAllWeeks();
  const latestWeekPlayed = await getCurrentWeekPlayed();
  const currentWeekNumber = latestWeekPlayed.week_number;
  const previousWeekPlayed = await getPreviousWeekPlayed(currentWeekNumber);

  console.log("Current Week:", currentWeekNumber);
  console.log("Previous Week:", previousWeekPlayed?.week_number);
  const currentWeek = await getWeek(latestWeekPlayed.week_number);

  if (currentWeek && currentWeek.date) {
    currentWeek.displayDate = new Date(
      currentWeek.date + "T12:00:00",
    ).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });
  }

  const standings = await getStandingsThroughWeek(currentWeekNumber);
  console.log("Standings Count: ", standings.length);

  const previousStandings = await getStandingsThroughWeek(
    previousWeekPlayed.week_number,
  );
  const previousRanks = {};

  previousStandings.forEach((player) => {
    previousRanks[player.id] = player.rank;
  });

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

  console.log(
    standings.map((p) => ({
      player: p.player_name,
      rank: p.rank,
      movement: p.movement,
      delta: p.delta,
    })),
  );

  return { standings, weeks, currentWeek };
};

/**
 * Fetches results for a specific week breakdown
 */
export const getWeeklyBreakdown = async (weekId) => {
  const sql = `
    SELECT m.name_first || ' ' || m.name_last AS player_name, 
           s.gross_total, s.net_total, s.stableford_total, s.ctp_points, s.birdie_points, 
           (s.stableford_total + s.ctp_points + s.birdie_points) AS total_points 
    FROM scores s JOIN members m ON m.id = s.member_id 
    WHERE s.week_id = ? ORDER BY total_points DESC
  `;
  return dbAll(sql, [weekId]);
};

/**
 * Gathers member biographical details combined with recursively joined historical records
 */
export const getMemberProfileData = async (memberId) => {
  const memberSql = `
    SELECT id, name_first, name_last
    FROM members
    WHERE id = ?
  `;

  const lastWeekPlayed = await getCurrentWeekPlayed();

  if (!lastWeekPlayed) {
    return { member, scores: [] };
  }

  const historySql = `
    WITH RECURSIVE league_weeks(week_number) AS (
      SELECT 1
      UNION ALL
      SELECT week_number + 1
      FROM league_weeks
      WHERE week_number < ?
    )
    SELECT
      lw.week_number,
      COALESCE(s.score_id, '') AS score_id,
      COALESCE(s.stableford_total, '') AS stableford_total,
      COALESCE(s.ctp_points, '') AS ctp_points,
      COALESCE(s.birdie_points, '') AS birdie_points,
      CASE
        WHEN s.score_id IS NOT NULL
        THEN (s.stableford_total + s.ctp_points + s.birdie_points)
        ELSE ''
      END AS total_points,
      COALESCE(s.gross_total, '') AS gross_total,
      COALESCE(s.net_total, '') AS net_total
    FROM league_weeks lw
    LEFT JOIN scores s
      ON s.week_id = lw.week_number
      AND s.member_id = ?
    ORDER BY lw.week_number ASC
  `;

  const member = await dbGet(memberSql, [memberId]);

  if (!member) return null;

  const scores = await dbAll(historySql, [
    lastWeekPlayed.week_number,
    memberId,
  ]);

  return { member, scores };
};

async function getStandingsThroughWeek(weekNumber) {
  const sql = `
    WITH raw_standings AS (
      SELECT
        m.id,
        m.name_last || ', ' || m.name_first AS player_name,
        COUNT(s.score_id) AS weeks_played,
        TOTAL(s.stableford_total) AS stableford_points,
        TOTAL(s.ctp_points) AS ctp_points,
        TOTAL(s.birdie_points) AS birdie_points,
        TOTAL(s.stableford_total + s.ctp_points + s.birdie_points) AS total_points,
        ROUND(
          TOTAL(s.stableford_total + s.ctp_points + s.birdie_points)
          / NULLIF(COUNT(s.score_id), 0),
          2
        ) AS avg_points,
        ROUND(AVG(s.gross_total), 2) AS avg_gross,
        ROUND(AVG(s.net_total), 2) AS avg_net,
        m.current_handicap
      FROM members m
      LEFT JOIN scores s
        ON s.member_id = m.id
       AND s.week_id <= ?
      GROUP BY m.id
    )
    SELECT
      RANK() OVER (ORDER BY avg_points DESC) AS rank,
      *
    FROM raw_standings
    ORDER BY rank ASC, total_points DESC
  `;

  return await dbAll(sql, [weekNumber]);
}
