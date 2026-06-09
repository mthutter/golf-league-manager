import db from "../config/db.js";

// --- Promise Helpers for SQLite Callbacks ---
const dbGet = (sql, params = []) =>
  new Promise((res, rej) =>
    db.get(sql, params, (e, r) => (e ? rej(e) : res(r))),
  );

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

export async function getAllPlayers() {
  const sql = `
    SELECT 
      id, name_last, name_first, phone, handicap, e_mail, year_joined, status, type 
    FROM members 
    ORDER BY name_last, name_first ASC
  `;
  return dbAll(sql);
}

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
    sex, // Fixed: Added missing variable mapping to match the query fields array
  ];

  return dbRun(sql, values);
}

/* ==========================================================================
   NEW DATABASE SERVICE LAYER WORK
   ========================================================================== */

/**
 * Fetch a single player record by database ID
 */
export async function getPlayerById(id) {
  const sql = `
    SELECT 
      id, name_last, name_first, phone, handicap, e_mail, year_joined, status, type, sex 
    FROM members 
    WHERE id = ?
  `;
  return dbGet(sql, [id]);
}

/**
 * Execute an UPDATE statement to save form edits into the database record
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
    id, // Targeting condition goes last to align with the WHERE execution
  ];

  return dbRun(sql, values);
}
