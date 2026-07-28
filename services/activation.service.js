import crypto from "crypto";
import logger from "../utilities/logger.js";
import { run, get, beginTransaction, commit, rollback } from "../config/db.js";
import bcrypt from "bcrypt";

const TOKEN_LIFETIME_HOURS = 48;

export async function createActivationToken(memberId) {
  // Invalidate any previous unused tokens
  await run(
    `
    DELETE FROM activation_tokens
    WHERE member_id = ?  
    `,
    [memberId],
  );

  const token = crypto.randomBytes(32).toString("hex");

  await run(
    `
    INSERT INTO activation_tokens
    (
      member_id,
      token,
      expires_at
    )
    VALUES
    (
      ?,
      ?,
      DATETIME('now', ?)
    )
    `,
    [memberId, token, `+${TOKEN_LIFETIME_HOURS} hours`],
  );

  logger.info({
    msg: "Activation token created",
    memberId,
  });

  return token;
}

export async function validateActivationToken(token) {
  const record = await get(
    `
    SELECT
      at.id AS activationTokenId,
      at.member_id AS memberId,
      at.token,
      at.expires_at,
      at.used_at,
      at.created_at,
      m.name_first AS firstName,
      m.name_last AS lastName,
      m.e_mail AS email,
      m.is_active AS isActive
    FROM activation_tokens at
    JOIN members m
      ON m.id = at.member_id
    WHERE at.token = ?
    `,
    [token],
  );

  if (!record) {
    logger.warn({
      msg: "Activation token not found",
      token,
    });

    return {
      valid: false,
      reason: "invalid",
    };
  }

  if (record.used_at) {
    return {
      valid: false,
      reason: "used",
    };
  }

  if (record.isActive) {
    return {
      valid: false,
      reason: "already-active",
    };
  }

  if (new Date(record.expires_at) < new Date()) {
    return {
      valid: false,
      reason: "expired",
    };
  }

  return {
    valid: true,
    member: record,
  };
}

export async function activateMember(token, password) {
  const validation = await validateActivationToken(token);

  if (!validation.valid) {
    return validation;
  }

  await beginTransaction();

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    await run(
      `
            UPDATE members
            SET
                password_hash = ?,
                email_verified = 1,
                is_active = 1,
                activated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
      [passwordHash, validation.member.memberId],
    );

    await run(
      `
            UPDATE activation_tokens
            SET used_at = CURRENT_TIMESTAMP
            WHERE token = ?
            AND used_at IS NULL
            `,
      [token],
    );

    await commit();

    logger.info({
      msg: "Member activated",
      memberId: validation.member.memberId,
    });

    return {
      success: true,
      member: validation.member,
    };
  } catch (err) {
    await rollback();

    throw err;
  }
}
