import "../config/env.js";
import { createActivationToken } from "./activation.service.js";
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

  const token = await createActivationToken(memberId);

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

  const token = await createActivationToken(memberId);

  const activationUrl = `${process.env.APP_URL}/activate?token=${token}`;

  await sendActivationEmail({
    member,
    activationUrl,
  });

  logger.info(`Resent activation email for member ${memberId}`);

  return {
    memberId,
    token,
  };
}
