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

    const member = await get(
      `
      SELECT
        id,
        name_first,
        name_last,
        e_mail,
        password_hash,
        is_active
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
      UPDATE members
      SET last_login = CURRENT_TIMESTAMP
      WHERE id = ?
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
    const member = await get(
      `
      SELECT
        id,
        name_first,
        name_last,
        e_mail,
        is_active
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
 * Private helper
 */
/**
 * Overwrites a target member's password hash using a newly generated plain text string.
 */
export async function updateMemberPassword(memberId, plainTextPassword) {
  try {
    // 1. Encrypt the fresh plain-text password argument using standard work factors
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(plainTextPassword, saltRounds);

    // 2. Overwrite the column mapping using your custom 'run' database utility promise wrapper
    await run(
      `
      UPDATE members 
      SET password_hash = ? 
      WHERE id = ?
      `,
      [passwordHash, memberId],
    );

    logger.info({ memberId }, "Administrative forced database password override completed successfully");
    return true;
  } catch (err) {
    logger.error(`updateMemberPassword Error [ID: ${memberId}]: ${err.message}`);
    throw err;
  }
}

async function getRoles(memberId) {
  const rows = await all(
    `
    SELECT role
    FROM member_roles
    WHERE member_id = ?
    `,
    [memberId],
  );

  return rows.map((r) => r.role);
}

/**
 * Private helper
 */
function buildUser(member, roles) {
  return {
    id: member.id,
    firstName: member.name_first,
    lastName: member.name_last,
    email: member.e_mail,
    roles,
    isActive: !!member.is_active,
  };
}
