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
  const week = await get(
    `
    SELECT week_number, date
    FROM weeks2026
    WHERE week_number = ?
  `,
    [weekNumber]
  );

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const [, month, day] = week.date.split("-");

  week.displayDate = `${monthNames[Number(month) - 1]} ${Number(day)}`;

  return week;
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
