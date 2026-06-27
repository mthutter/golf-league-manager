// services/weeks.js

import { all, get } from "../config/db.js";

export async function getAllWeeks() {
  const weeks = await all(`
    SELECT week_number, date
    FROM weeks2026
    ORDER BY week_number
  `);

  weeks.forEach((week) => {
    week.displayDate = formatLeagueDate(week.date);
  });

  return weeks;
}

export async function getWeek(weekNumber) {
  const week = await get(
    `
    SELECT week_number, date
    FROM weeks2026
    WHERE week_number = ?
  `,
    [weekNumber],
  );

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

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

export async function getPreviousWeekPlayed(currentWeekNumber) {
  return await get(
    `
    SELECT MAX(week_id) AS week_number
    FROM scores
    WHERE week_id < ?
  `,
    [currentWeekNumber],
  );
}

export function formatLeagueDate(dateString) {
  return new Date(dateString + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}
export function formatDateTime(dateString) {
  if (!dateString) return "Never";

  return new Date(dateString + "Z").toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
