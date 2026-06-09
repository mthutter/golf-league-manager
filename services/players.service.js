import db from "../config/db.js";

// --- Promise Helpers for SQLite Callbacks ---
const dbAll = (sql, params = []) =>
  new Promise((res, rej) =>
    db.all(sql, params, (e, r) => (e ? rej(e) : res(r))),
  );
const dbRun = (sql, params = []) =>
  new Promise((res, rej) =>
    db.run(sql, params, function (e) {
      e ? rej(e) : res(this.lastID);
    }),
  );

/**
 * Fetches all member profiles ordered alphabetically
 */
export async function getAllPlayers() {
  const sql = `
    SELECT id, name_last, name_first, phone, handicap, e_mail, year_joined, status, type 
    FROM members 
    ORDER BY name_last, name_first ASC
  `;
  return dbAll(sql);
}

/**
 * Inserts a new member record into the database
 */
export async function createNewPlayer(playerData) {
  const {
    name_last,
    name_first,
    phone,
    handicap,
    password,
    e_mail,
    year_joined,
    status,
    type,
    sex,
  } = playerData;

  const sql = `
    INSERT INTO members ( 
      name_last, name_first, phone, handicap, password, e_mail, year_joined, status, type, sex
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    name_last,
    name_first,
    phone,
    handicap,
    password,
    e_mail,
    year_joined,
    status,
    type,
  ];

  return dbRun(sql, values); // Returns the newly created player's lastID
}
