import db from "../config/db.js";

// -----------------------------------------------------------------------------
// Promise Helpers
// -----------------------------------------------------------------------------

const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))),
  );

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))),
  );

const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) return reject(err);

      resolve({
        lastID: this.lastID,
        changes: this.changes,
      });
    }),
  );

// -----------------------------------------------------------------------------
// Queries
// -----------------------------------------------------------------------------

export async function getAllPlayers() {
  const sql = `
    SELECT
      id,
      name_last,
      name_first,
      phone,
      handicap,
      e_mail,
      year_joined,
      status,
      type,
      sex
    FROM members
    ORDER BY name_last, name_first
  `;

  return dbAll(sql);
}

export async function getPlayerById(id) {
  const sql = `
    SELECT
      id,
      name_last,
      name_first,
      phone,
      handicap,
      e_mail,
      year_joined,
      status,
      type,
      sex
    FROM members
    WHERE id = ?
  `;

  return dbGet(sql, [id]);
}

// -----------------------------------------------------------------------------
// Create Player
// -----------------------------------------------------------------------------

export async function createNewPlayer({
  name_last,
  name_first,
  phone,
  handicap = null,
  e_mail,
  year_joined,
  status,
  type,
  sex,
}) {
  const sql = `
    INSERT INTO members (
      name_last,
      name_first,
      phone,
      handicap,
      e_mail,
      year_joined,
      status,
      type,
      sex,
      password_hash,
      is_active,
      activated_at
    )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      NULL,
      0,
      NULL
    )
  `;

  const result = await dbRun(sql, [
    name_last,
    name_first,
    phone,
    handicap,
    e_mail,
    year_joined,
    status,
    type,
    sex,
  ]);

  return result.lastID;
}

// -----------------------------------------------------------------------------
// Update Player
// -----------------------------------------------------------------------------

export async function updatePlayerById(
  id,
  { name_last, name_first, phone, e_mail, year_joined, status, type, sex },
) {
  const sql = `
    UPDATE members
       SET
         name_last   = ?,
         name_first  = ?,
         phone       = ?,
         e_mail      = ?,
         year_joined = ?,
         status      = ?,
         type        = ?,
         sex         = ?
     WHERE id = ?
  `;

  return dbRun(sql, [
    name_last,
    name_first,
    phone,
    e_mail,
    year_joined,
    status,
    type,
    sex,
    id,
  ]);
}
