import db from "../config/db.js";
import {
  getAllWeeks,
  getCurrentWeekPlayed,
  getPreviousWeekPlayed,
  getWeek,
} from "./weeks.service.js";
import { buildHoleScores } from "./golf.service.js";

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
 * Helper to dynamically map sequential index form inputs to back-nine database columns (10-18)
 */
function extractHoleScoresFromPayload(body) {
  return [
    body.gross_hole_10 || body.gross_hole_1 || body.gross10 || 0,
    body.gross_hole_11 || body.gross_hole_2 || body.gross11 || 0,
    body.gross_hole_12 || body.gross_hole_3 || body.gross12 || 0,
    body.gross_hole_13 || body.gross_hole_4 || body.gross13 || 0,
    body.gross_hole_14 || body.gross_hole_5 || body.gross14 || 0,
    body.gross_hole_15 || body.gross_hole_6 || body.gross15 || 0,
    body.gross_hole_16 || body.gross_hole_7 || body.gross16 || 0,
    body.gross_hole_17 || body.gross_hole_8 || body.gross17 || 0,
    body.gross_hole_18 || body.gross_hole_9 || body.gross18 || 0,
  ];
}

/**
 * Fetches initial data needed to construct the score form
 */
export const getFormData = async () => {
  const memberSql = ` 
        SELECT id, name_first, name_last, status, COALESCE(current_handicap, handicap) AS handicap 
        FROM members 
        WHERE status !== 'No'
        AND in_non_member = 0
        ORDER BY name_last, name_first 
    `;
  const holesSql = `SELECT * FROM holes WHERE hole_number >= 10 ORDER BY hole_number`;
  const [members, holes] = await Promise.all([
    dbAll(memberSql),
    dbAll(holesSql),
  ]);
  return {
    members,
    holes,
  };
};

/**
 * Inserts scoring record from a request payload
 */
export const createScoreRecord = async (body) => {
  const sql = ` 
        INSERT INTO scores ( 
            week_id, member_id, handicap_used, ctp_points, birdie_points, 
            gross10, gross11, gross12, gross13, gross14, gross15, gross16, gross17, gross18, 
            gross_total, net_total, stableford_total, skins_entered 
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) 
    `;

  const holeScores = extractHoleScoresFromPayload(body);

  const params = [
    body.weekId,
    body.memberId,
    body.handicap,
    body.ctp_points || 0,
    body.birdie_points || 0,
    ...holeScores,
    body.gross_total,
    body.net_total,
    body.stableford_total,
    body.skins_entered ? 1 : 0,
  ];
  return dbRun(sql, params);
};

/**
 * Updates an existing score record inside the database
 */
export const updateScoreRecord = async (scoreId, body) => {
  const sql = `
        UPDATE scores 
        SET 
            ctp_points = ?, 
            birdie_points = ?, 
            gross10 = ?, gross11 = ?, gross12 = ?, gross13 = ?, gross14 = ?, gross15 = ?, gross16 = ?, gross17 = ?, gross18 = ?, 
            gross_total = ?, 
            net_total = ?, 
            stableford_total = ?, 
            skins_entered = ?
        WHERE score_id = ?
    `;

  const holeScores = extractHoleScoresFromPayload(body);

  const params = [
    body.ctp_points || 0,
    body.birdie_points || 0,
    ...holeScores,
    body.gross_total,
    body.net_total,
    body.stableford_total,
    body.skins_entered ? 1 : 0,
    scoreId,
  ];

  return dbRun(sql, params);
};
/**
 * Fetches season standings and maps localized dates
 */
export const getSeasonStandings = async (selectedWeekNumber = null) => {
  const weeks = await getAllWeeks();
  const latestWeekPlayed = await getCurrentWeekPlayed();
  const latestWeek = await getWeek(latestWeekPlayed.week_number);
  if (latestWeek?.date) {
    latestWeek.displayDate = new Date(
      latestWeek.date + "T12:00:00",
    ).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });
  }
  const currentWeekNumber = selectedWeekNumber || latestWeekPlayed.week_number;
  const previousWeekPlayed = await getPreviousWeekPlayed(currentWeekNumber);
  const currentWeek = await getWeek(currentWeekNumber);
  if (currentWeek && currentWeek.date) {
    currentWeek.displayDate = new Date(
      currentWeek.date + "T12:00:00",
    ).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });
  }
  const standings = await getStandingsThroughWeek(currentWeekNumber);
  const previousStandings = await getStandingsThroughWeek(
    previousWeekPlayed.week_number,
  );
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
 * Fetches results for a specific week breakdown
 */
export const getWeeklyBreakdown = async (weekId) => {
  const sql = ` 
        SELECT s.score_id, m.id AS member_id, m.name_first || ' ' || m.name_last AS player_name, s.gross_total, s.net_total, s.stableford_total, s.ctp_points, s.birdie_points, (s.stableford_total + s.ctp_points + s.birdie_points) AS total_points 
        FROM scores s 
        JOIN members m ON m.id = s.member_id 
        WHERE s.week_id = ? 
        ORDER BY total_points DESC 
    `;
  return dbAll(sql, [weekId]);
};

/**
 * Gathers member biographical details combined with recursively joined historical records
 */
export const getMemberProfileData = async (memberId) => {
  const memberSql = ` SELECT id, name_first, name_last FROM members WHERE id = ? `;
  const lastWeekPlayed = await getCurrentWeekPlayed();
  if (!lastWeekPlayed) {
    return {
      member,
      scores: [],
    };
  }
  const historySql = ` 
        WITH RECURSIVE league_weeks(week_number) AS ( 
            SELECT 1 UNION ALL SELECT week_number + 1 FROM league_weeks WHERE week_number < ? 
        ) 
        SELECT lw.week_number, COALESCE(s.score_id, '') AS score_id, COALESCE(s.stableford_total, '') AS stableford_total, COALESCE(s.ctp_points, '') AS ctp_points, COALESCE(s.birdie_points, '') AS birdie_points, CASE WHEN s.score_id IS NOT NULL THEN (s.stableford_total + s.ctp_points + s.birdie_points) ELSE '' END AS total_points, COALESCE(s.gross_total, '') AS gross_total, COALESCE(s.net_total, '') AS net_total 
        FROM league_weeks lw 
        LEFT JOIN scores s ON s.week_id = lw.week_number AND s.member_id = ? 
        ORDER BY lw.week_number ASC 
    `;
  const member = await dbGet(memberSql, [memberId]);
  if (!member) return null;
  const scores = await dbAll(historySql, [
    lastWeekPlayed.week_number,
    memberId,
  ]);
  return {
    member,
    scores,
  };
};

async function getStandingsThroughWeek(weekNumber) {
  const sql = ` 
        WITH raw_standings AS ( 
            SELECT m.id, m.status, m.name_last || ', ' || m.name_first AS player_name, m.standings_exempt, COUNT(s.score_id) AS weeks_played, TOTAL(s.stableford_total) AS stableford_points, TOTAL(s.ctp_points) AS ctp_points, TOTAL(s.birdie_points) AS birdie_points, TOTAL(s.stableford_total + s.ctp_points + s.birdie_points) AS total_points, ROUND( TOTAL(s.stableford_total + s.ctp_points + s.birdie_points) / NULLIF(COUNT(s.score_id), 0), 2 ) AS avg_points, ROUND(AVG(s.gross_total), 2) AS avg_gross, ROUND(AVG(s.net_total), 2) AS avg_net, m.current_handicap 
            FROM members m 
            LEFT JOIN scores s ON s.member_id = m.id AND s.week_id <= ? 
            WHERE m.is_non_member = 0
            GROUP BY m.id 
        ) 
        SELECT CASE WHEN standings_exempt = 1 THEN NULL ELSE RANK() OVER ( PARTITION BY standings_exempt ORDER BY avg_points DESC ) END AS rank, * 
        FROM raw_standings 
        ORDER BY standings_exempt ASC, rank ASC, total_points DESC 
    `;
  return await dbAll(sql, [weekNumber]);
}

export const getRoundDetails = async (scoreId) => {
  const roundSql = ` 
        SELECT s.*, m.name_first, m.name_last, m.sex, w.week_number, w.date 
        FROM scores s 
        JOIN members m ON m.id = s.member_id 
        JOIN weeks2026 w ON w.week_number = s.week_id 
        WHERE s.score_id = ? 
    `;
  const round = await dbGet(roundSql, [scoreId]);
  if (!round) return null;

  round.displayDate = new Date(round.date + "T12:00:00").toLocaleDateString(
    "en-US",
    {
      month: "long",
      day: "numeric",
    },
  );
  const holeData = await dbAll(` SELECT * FROM holes ORDER BY hole_number `);
  const startHole = round.week_number <= 11 ? 1 : 10;
  const holes = buildHoleScores(round, holeData, startHole);
  const totals = {
    par: holes.reduce((sum, hole) => sum + hole.par, 0),
    gross: round.gross_total,
    net: round.net_total,
    points: holes.reduce((sum, hole) => sum + hole.points, 0),
    stableford: round.stableford_total,
    birdies: round.birdie_points,
    ctp: round.ctp_points,
    leaguePoints:
      round.stableford_total + round.birdie_points + round.ctp_points,
  };
  return {
    id: round.score_id,
    week_id: round.week_id,
    member_id: round.member_id,
    skins_entered: round.skins_entered,
    ctp_points: round.ctp_points,
    birdie_points: round.birdie_points,
    handicap: round.handicap_used,
    gross_hole_10: round.gross10,
    gross_hole_11: round.gross11,
    gross_hole_12: round.gross12,
    gross_hole_13: round.gross13,
    gross_hole_14: round.gross14,
    gross_hole_15: round.gross15,
    gross_hole_16: round.gross16,
    gross_hole_17: round.gross17,
    gross_hole_18: round.gross18,
    week_number: round.week_number,
    week_date: round.displayDate,
    name_first: round.name_first,
    name_last: round.name_last,
    player: {
      id: round.member_id,
      firstName: round.name_first,
      lastName: round.name_last,
      displayName: `${round.name_first} ${round.name_last}`,
      sex: round.sex,
    },
    week: {
      number: round.week_number,
      date: round.date,
      displayDate: round.displayDate,
    },
    handicapUsed: round.handicap_used,
    skinsEntered: Boolean(round.skins_entered),
    holes,
    totals,
  };
};
