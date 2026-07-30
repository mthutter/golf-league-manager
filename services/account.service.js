import "../config/env.js";
import crypto from "crypto";
import db from "../config/db.js";
import logger from "../utilities/logger.js";
import * as rolesService from "./roles.service.js";
import { sendActivationEmail } from "./email.service.js";
import { ROLES } from "./roles.service.js";

// -----------------------------------------------------------------------------
// Promise Helpers
// -----------------------------------------------------------------------------

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

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))),
  );

// -----------------------------------------------------------------------------
// Private Helpers
// -----------------------------------------------------------------------------

export async function findMemberByEmail(email) {
  return await dbGet(
    `
    SELECT
      id,
      name_first,
      e_mail,
      is_active
    FROM members
    WHERE lower(e_mail) = lower(?)
    `,
    [email],
  );
}

function generateActivationToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function saveActivationToken(memberId, token) {
  // Remove any previous unused activation tokens
  await dbRun(
    `
        DELETE
          FROM activation_tokens
         WHERE member_id = ?
         AND used_at IS NULL;
        `,
    [memberId],
  );

  await dbRun(
    `
        INSERT INTO activation_tokens
        (
            member_id,
            token,
            purpose,
            expires_at
        )
        VALUES
        (
            ?,
            ?,
            ?,
            datetime('now', '+2 days')
        )
        `,
    [memberId, token],
  );
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export async function initializeAccount(
  memberId,
  {
    roles = [ROLES.MEMBER],
    sendActivationEmail: sendEmail = true,
    email,
    firstName,
  },
) {
  await rolesService.replaceRoles(memberId, roles);

  const token = generateActivationToken();

  await saveActivationToken(memberId, token);

  if (sendEmail && email) {
    const activationUrl = `${process.env.APP_URL}/activate?token=${token}`;

    await sendActivationEmail({
      member: {
        id: memberId,
        name_first: firstName,
        e_mail: email,
      },
      activationUrl,
    });
  }

  logger.info(`Initialized account for member ${memberId}`);

  return {
    memberId,
    token,
  };
}

export async function resendActivationEmail(memberId) {
  const member = await dbGet(
    `
    SELECT
      id,
      name_first,
      e_mail
    FROM members
    WHERE id = ?
    `,
    [memberId],
  );

  if (!member) {
    throw new Error("Member not found.");
  }

  const token = generateActivationToken();

  await dbRun(
    `
    DELETE
    FROM activation_tokens
    WHERE member_id = ?
    `,
    [memberId],
  );

  await saveActivationToken(memberId, token);

  const activationUrl = `${process.env.APP_URL}/activate?token=${token}`;

  await sendActivationEmail({
    member,
    activationUrl,
  });

  logger.info(`Resent activation email for member ${memberId}`);
}
