import db from "../config/db.js";

// -----------------------------------------------------------------------------
// Promise Helpers
// -----------------------------------------------------------------------------
const dbAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));

const dbGet = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));

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
    SELECT id, name_last, name_first, phone, handicap, e_mail, year_joined, status, type, sex
    FROM members
    ORDER BY name_last, name_first
  `;
  return dbAll(sql);
}

export async function getPlayerById(id) {
  const sql = `
    SELECT id, name_last, name_first, phone, handicap, e_mail, year_joined, status, type, sex
    FROM members
    WHERE id = ?
  `;
  return dbGet(sql, [id]);
}

// -----------------------------------------------------------------------------
// Create Player
// -----------------------------------------------------------------------------
export async function createNewPlayer({ name_last, name_first, phone, handicap = null, e_mail, year_joined, status, type, sex }) {
  const sql = `
    INSERT INTO members (
      name_last, name_first, phone, handicap, e_mail, year_joined, status, type, sex,
      password_hash, is_active, activated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL
    )
  `;

  // Sanitize text parameters cleanly for long-term consistency
  const cleanPhone = phone ? phone.replace(/\D/g, "") : "";
  const cleanEmail = e_mail ? e_mail.trim().toLowerCase() : "";

  const result = await dbRun(sql, [name_last?.trim(), name_first?.trim(), cleanPhone, handicap, cleanEmail, parseInt(year_joined, 10) || 2026, status, type, sex]);
  return result.lastID;
}

// -----------------------------------------------------------------------------
// Update Player
// -----------------------------------------------------------------------------
export async function updatePlayerById(id, { name_last, name_first, phone, e_mail, year_joined, status, type, sex }) {
  const sql = `
    UPDATE members
    SET name_last = ?, name_first = ?, phone = ?, e_mail = ?, year_joined = ?, status = ?, type = ?, sex = ?
    WHERE id = ?
  `;

  const cleanPhone = phone ? phone.replace(/\D/g, "") : "";
  const cleanEmail = e_mail ? e_mail.trim().toLowerCase() : "";

  return dbRun(sql, [name_last?.trim(), name_first?.trim(), cleanPhone, cleanEmail, parseInt(year_joined, 10) || 2026, status, type, sex, id]);
}

// -----------------------------------------------------------------------------
// Member Roles Actions
// -----------------------------------------------------------------------------

/**
 * Fetch all roles assigned to a member.
 * Returns an array of raw strings, e.g., ['Member', 'Admin']
 */
export async function getPlayerRoles(memberId) {
  const sql = `SELECT role FROM member_roles WHERE member_id = ?`;
  const rows = await dbAll(sql, [memberId]);
  return rows.map((row) => row.role);
}

/**
 * Bulk insert selected roles for a targeted member profile
 */
export async function assignPlayerRoles(memberId, rolesArray) {
  if (!rolesArray || rolesArray.length === 0) return;

  const sql = `INSERT INTO member_roles (member_id, role) VALUES (?, ?)`;
  for (const role of rolesArray) {
    await dbRun(sql, [memberId, role]);
  }
}

/**
 * Sync roles by clearing old allocations and re-writing checked forms
 */
export async function syncPlayerRoles(memberId, rolesArray) {
  const clearSql = `DELETE FROM member_roles WHERE member_id = ?`;
  await dbRun(clearSql, [memberId]);
  await assignPlayerRoles(memberId, rolesArray);
}
