// services/weeks.js

<<<<<<< HEAD
import { all, get } from "../config/db.js";
import { LEAGUE_TIME_ZONE } from "../config/league.js";
import logger from "../utilities/logger.js";
=======
import {
    all,
    get
} from "../config/db.js";
import {
    LEAGUE_TIME_ZONE
} from "../config/league.js";
>>>>>>> 1b9e111890d5b3a533ce166c1e2d4fcb3ed93d61

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

<<<<<<< HEAD
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
=======
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
>>>>>>> 1b9e111890d5b3a533ce166c1e2d4fcb3ed93d61

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
<<<<<<< HEAD
  const currentWeek = await get(`
        SELECT MAX(week_id) AS week_number 
        FROM scores 
    `);
  logger.info(`currentWeek internal: ${JSON.stringify(currentWeek)}`);
  return currentWeek;
=======
    return await get(`
    SELECT MAX(week_id) AS week_number
    FROM scores
  `);
>>>>>>> 1b9e111890d5b3a533ce166c1e2d4fcb3ed93d61
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
        timeZone: LEAGUE_TIME_ZONE,
    });
}

export async function getUpcomingWeek() {
    return await get(`
    SELECT week_number, date
    FROM weeks2026
    WHERE date >= date('now')
    ORDER BY date
    LIMIT 1
  `);
}

/**
 * Returns the course hole range played for a league week.
 *
 * @param {number} weekId
 * @returns {{startHole:number,endHole:number}}
 */
export function getWeekHoleRange(weekId) {
    if (!weekId) {
        throw new Error("A valid week ID is required.");
    }

<<<<<<< HEAD
  return weekId <= 11 ? { startHole: 1, endHole: 9 } : { startHole: 10, endHole: 18 };
}
=======
    return weekId <= 11 ?
        {
            startHole: 1,
            endHole: 9
        } :
        {
            startHole: 10,
            endHole: 18
        };
}
>>>>>>> 1b9e111890d5b3a533ce166c1e2d4fcb3ed93d61
