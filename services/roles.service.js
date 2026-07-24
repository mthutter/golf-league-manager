import db from "../config/db.js";
import logger from "../utilities/logger.js";

// -----------------------------------------------------------------------------
// Promise Helpers
// -----------------------------------------------------------------------------
export const ROLES = Object.freeze({
  MEMBER: "Member",
  ADMIN: "Administrator",
  COMMISSIONER: "Commissioner",
  TREASURER: "Treasurer",
});

const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))),
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
// Public API
// -----------------------------------------------------------------------------

export async function getRolesForMember(memberId) {
  const rows = await dbAll(
    `
    SELECT role
      FROM member_roles
     WHERE member_id = ?
     ORDER BY role
    `,
    [memberId],
  );

  return rows.map((r) => r.role);
}

export async function assignDefaultRole(memberId) {
  return replaceRoles(memberId, ["Member"]);
}

export async function replaceRoles(memberId, roles = []) {
  // Remove duplicates and empty values
  const uniqueRoles = [...new Set(roles)].map((r) => r.trim()).filter(Boolean);

  await dbRun(
    `
    DELETE
      FROM member_roles
     WHERE member_id = ?
    `,
    [memberId],
  );

  for (const role of uniqueRoles) {
    await dbRun(
      `
      INSERT INTO member_roles (
        member_id,
        role
      )
      VALUES (?, ?)
      `,
      [memberId, role],
    );
  }

  logger.info(
    `Updated roles for member ${memberId}: ${uniqueRoles.join(", ") || "None"}`,
  );

  return uniqueRoles;
}

export async function getAllRoles() {
  return ["Member", "Administrator", "Commissioner", "Treasurer"];
}
