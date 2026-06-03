// services/weeks.js

import { all, get } from "../config/db.js";

export async function getAllWeeks() {
  return await all(`
    SELECT week_number, date
    FROM weeks2026
    ORDER BY week_number
  `);
}

export async function getWeek(weekNumber) {
  return await get(
    `
    SELECT week_number, date
    FROM weeks2026
    WHERE week_number = ?
  `,
    [weekNumber],
  );
}

export async function getCurrentWeek() {
  const week = await get(`
    SELECT week_number, date
    FROM weeks2026
    WHERE date <= date('now')
    ORDER BY date DESC
    LIMIT 1
  `);

  return week;
}

export async function getCurrentWeekPlayed() {
  return await get(`
    SELECT MAX(week_id) AS week_number
    FROM scores
  `);
}
