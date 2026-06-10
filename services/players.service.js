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

// Helper to fetch a single row
const dbGet = (sql, params = []) =>
  new Promise((res, rej) =>
    db.get(sql, params, (e, r) => (e ? rej(e) : res(r))),
  );

/**
 * Fetches all member profiles ordered alphabetically
 */
export async function getAllPlayers() {
  const sql = `
    SELECT id, name_last, name_first, phone, handicap, e_mail, year_joined, status, type, sex
    FROM members
    ORDER BY name_last, name_first ASC
  `;
  return dbAll(sql);
}

/**
 * Fetches a single member record by its primary key ID
 */
export async function getPlayerById(id) {
  const sql = `
    SELECT id, name_last, name_first, phone, handicap, e_mail, year_joined, status, type, sex
    FROM members
    WHERE id = ?
  `;
  return dbGet(sql, [id]);
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

  // Fixed: Added 'sex' column to the column list to match the 10 values being inserted
  const sql = `
    INSERT INTO members (
      name_last, name_first, phone, handicap, password, 
      e_mail, year_joined, status, type, sex
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    sex,
  ];

  return dbRun(sql, values); // Returns the newly created player's lastID
}

/**
 * Updates an existing member record in the database
 */
export async function updatePlayerById(id, playerData) {
  const {
    name_last,
    name_first,
    phone,
    e_mail,
    year_joined,
    status,
    type,
    sex,
  } = playerData;

  const sql = `
    UPDATE members 
    SET 
      name_last = ?, 
      name_first = ?, 
      phone = ?, 
      e_mail = ?, 
      year_joined = ?, 
      status = ?, 
      type = ?, 
      sex = ?
    WHERE id = ?
  `;

  const values = [
    name_last,
    name_first,
    phone,
    e_mail,
    year_joined,
    status,
    type,
    sex,
    id,
  ];

  return dbRun(sql, values);
}
