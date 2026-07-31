import "../config/env.js";
import {
  createActivationToken,
  createToken,
  TOKEN_PURPOSE,
} from "./activation.service.js";
import db from "../config/db.js";
import logger from "../utilities/logger.js";
import * as rolesService from "./roles.service.js";
import {
  sendActivationEmail,
  sendPasswordResetEmail,
} from "./email.service.js";
import { ROLES } from "./roles.service.js";

// -----------------------------------------------------------------------------
// Promise Helpers
// -----------------------------------------------------------------------------

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

export async function requestPasswordReset(email) {
  email = email.trim();
  const member = await findMemberByEmail(email);

  // Don't reveal whether the account exists or is active.
  if (!member || !member.is_active) {
    logger.info(`Password reset requested for unknown/inactive account.`);
    return;
  }

  const token = await createToken(member.id, TOKEN_PURPOSE.PASSWORD_RESET);

  const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;

  await sendPasswordResetEmail({
    member,
    resetUrl,
  });

  logger.info(`Password reset email sent for member ${member.id}`);
}
