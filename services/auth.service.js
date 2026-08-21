import bcrypt from "bcrypt";
import { get, all, run } from "../config/db.js";
import logger from "../utilities/logger.js";

/**
 * Authenticate a member by email/password.
 * Returns a sanitized user object or null.
 */
export async function authenticate(email, password) {
  try {
    email = email?.trim().toLowerCase();

    // 💡 FIXED: Added 'is_non_member' directly into the core select query string
    const member = await get(
      `
            SELECT id, name_first, name_last, e_mail, password_hash, is_active, is_non_member 
            FROM members 
            WHERE lower(e_mail) = ?
            `,
      [email],
    );

    if (!member) {
      logger.warn(`Failed login: unknown email (${email})`);
      return null;
    }
    if (!member.is_active) {
      logger.warn(`Failed login: inactive account (${email})`);
      return null;
    }
    if (!member.password_hash) {
      logger.warn(`Failed login: no password set (${email})`);
      return null;
    }

    const valid = await bcrypt.compare(password, member.password_hash);
    if (!valid) {
      logger.warn(`Failed login: invalid password (${email})`);
      return null;
    }

    const roles = await getRoles(member.id);

    await run(
      `
            UPDATE members SET last_login = CURRENT_TIMESTAMP WHERE id = ?
            `,
      [member.id],
    );

    logger.info(`Successful login: ${email}`);
    return buildUser(member, roles);
  } catch (err) {
    logger.error(`Authentication error: ${err.message}`);
    throw err;
  }
}

/**
 * Used by Passport deserializeUser()
 */
export async function findMemberById(id) {
  try {
    // 💡 FIXED: Added 'is_non_member' to the session deserialization routine
    const member = await get(
      `
            SELECT id, name_first, name_last, e_mail, is_active, is_non_member 
            FROM members 
            WHERE id = ?
            `,
      [id],
    );

    if (!member || !member.is_active) {
      return null;
    }

    const roles = await getRoles(member.id);
    return buildUser(member, roles);
  } catch (err) {
    logger.error(`findMemberById(): ${err.message}`);
    throw err;
  }
}
/**
 * Overwrites a target member's password hash using a newly generated plain text string.
 */
export async function updateMemberPassword(memberId, plainTextPassword) {
  try {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(plainTextPassword, saltRounds);

    await run(
      `
            UPDATE members SET password_hash = ? WHERE id = ?
            `,
      [passwordHash, memberId],
    );

    logger.info(
      { memberId },
      "Administrative forced database password override completed successfully",
    );
    return true;
  } catch (err) {
    logger.error(
      `updateMemberPassword Error [ID: ${memberId}]: ${err.message}`,
    );
    throw err;
  }
}

/**
 * Fetch roles assigned to a user from the role matrix table
 */
async function getRoles(memberId) {
  const rows = await all(
    `
        SELECT role FROM member_roles WHERE member_id = ?
        `,
    [memberId],
  );
  return rows.map((r) => r.role);
}

/**
 * 💡 FIXED: Formatter-safe user constructor factory automatically computes access logic
 */
function buildUser(member, roles) {
  const isNonMember = member.is_non_member === 1;
  const cleanEmail = member.e_mail ? member.e_mail.toLowerCase().trim() : "";

  // Explicit security anchor for your direct system administrator accounts
  const isSystemAdmin =
    cleanEmail === "admin@bottoms-up-cos.org" ||
    cleanEmail === "mthutter@me.com" ||
    roles.includes("admin");

  // Reconstruct roles array smoothly to ensure stability across front-end telemetry tags
  let finalRoles = [...roles];
  if (isSystemAdmin && !finalRoles.includes("admin")) finalRoles.push("admin");
  if (isNonMember && !isSystemAdmin && !finalRoles.includes("test_runner"))
    finalRoles.push("test_runner");
  if (!isNonMember && !finalRoles.includes("player")) finalRoles.push("player");

  return {
    id: member.id,
    firstName: member.name_first,
    lastName: member.name_last,
    email: member.e_mail,
    roles: finalRoles,
    isActive: !!member.is_active,

    // 💡 SYSTEM MAPS: Feeds variable parameters cleanly to your front-end scripts
    isAdmin: isSystemAdmin,
    isMember: !isNonMember,
  };
}

/**
 * 💡 UPDATED: Fetches EVERY user from the database (Members, Admins, and Test Accounts)
 * This allows administrators to reset passwords and override activation blockades for any profile.
 */
export const getAllSystemUsers = async () => {
  try {
    const sql = `
            SELECT id, name_first, name_last, e_mail, is_active, is_non_member
            FROM members 
            ORDER BY name_last ASC, name_first ASC
        `;

    const users = await all(sql);
    logger.info(
      { count: users?.length || 0 },
      "Master credential roster populated for admin override utility",
    );
    return users || [];
  } catch (err) {
    logger.error(`getAllSystemUsers Service Exception: ${err.message}`);
    throw err;
  }
};
