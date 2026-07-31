import crypto from "crypto";
import logger from "../utilities/logger.js";
import { run, get, beginTransaction, commit, rollback } from "../config/db.js";
import bcrypt from "bcrypt";

export const TOKEN_LIFETIME = {
  ACTIVATION: 48,
  PASSWORD_RESET: 1,
};

export const TOKEN_PURPOSE = {
  ACTIVATION: "activation",
  PASSWORD_RESET: "password_reset",
};

export async function createToken(
  memberId,
  purpose = TOKEN_PURPOSE.ACTIVATION,
) {
  const lifetimeHours =
    purpose === TOKEN_PURPOSE.PASSWORD_RESET
      ? TOKEN_LIFETIME.PASSWORD_RESET
      : TOKEN_LIFETIME.ACTIVATION;
  // Invalidate any previous unused tokens of the same purpose
  await run(
    `
    UPDATE activation_tokens
    SET used_at = CURRENT_TIMESTAMP
    WHERE member_id = ?
      AND purpose = ?
      AND used_at IS NULL
    `,
    [memberId, purpose],
  );

  // Generate new token
  const token = crypto.randomBytes(32).toString("hex");

  // Calculate expiration
  const expiresAt = new Date(
    Date.now() + lifetimeHours * 60 * 60 * 1000,
  ).toISOString();

  // Insert new token
  await run(
    `
    INSERT INTO activation_tokens (
      member_id,
      token,
      purpose,
      expires_at
    )
    VALUES (?, ?, ?, ?)
    `,
    [memberId, token, purpose, expiresAt],
  );

  return token;
}

export async function validateToken(token, purpose = TOKEN_PURPOSE.ACTIVATION) {
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
    AND at.purpose = ?
    `,
    [token, purpose],
  );

  if (!record) {
    logger.warn({
      msg: "Token not found",
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

  if (purpose === TOKEN_PURPOSE.ACTIVATION && record.isActive) {
    return {
      valid: false,
      reason: "already-active",
    };
  }

  if (purpose === TOKEN_PURPOSE.PASSWORD_RESET && !record.isActive) {
    return {
      valid: false,
      reason: "inactive",
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

export async function markTokenUsed(token) {
  await run(
    `
    UPDATE activation_tokens
    SET used_at = CURRENT_TIMESTAMP
    WHERE token = ?
      AND used_at IS NULL
    `,
    [token],
  );
}

export async function createActivationToken(memberId) {
  return createToken(memberId, TOKEN_PURPOSE.ACTIVATION);
}

export async function validateActivationToken(token) {
  return validateToken(token, TOKEN_PURPOSE.ACTIVATION);
}

export async function activateMember(token, password) {
  // 1. Begin the transaction first to lock the database properly for reads/writes
  await beginTransaction();

  try {
    // 2. Perform validation inside the transaction block
    const validation = await validateActivationToken(token);
    if (!validation.valid) {
      await rollback(); // Don't leave the transaction dangling!
      return validation;
    }

    // 3. Process the password hashing
    const passwordHash = await bcrypt.hash(password, 12);

    // 4. Update the member status
    await run(
      `
      UPDATE members 
      SET password_hash = ?, email_verified = 1, is_active = 1, activated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
      `,
      [passwordHash, validation.member.memberId],
    );

    // 5. Mark the token as used
    await markTokenUsed(token);

    // 6. Commit changes smoothly
    await commit();

    logger.info({
      msg: "Member activated",
      memberId: validation.member.memberId,
    });
    return { success: true, member: validation.member };
  } catch (err) {
    // 7. Safe rollback on any query or hashing failures
    try {
      await rollback();
    } catch (rollbackErr) {
      logger.error({
        msg: "Transaction rollback failed",
        error: rollbackErr.message,
      });
    }
    throw err; // Ensure the controller catches this to send an HTTP 500
  }
}

export async function resetPassword(token, password) {
  // 1. Begin the transaction first to lock the database properly for reads/writes
  await beginTransaction();

  try {
    // 2. Perform validation inside the transaction block
    const validation = await validateToken(token, TOKEN_PURPOSE.PASSWORD_RESET);
    if (!validation.valid) {
      await rollback(); // Don't leave the transaction dangling!
      return validation;
    }

    // 3. Process the password hashing
    const passwordHash = await bcrypt.hash(password, 12);

    // 4. Update the member status
    await run(
      `
      UPDATE members 
      SET password_hash = ?
      WHERE id = ?
      `,
      [passwordHash, validation.member.memberId],
    );

    // 5. Mark the token as used
    await markTokenUsed(token);

    // 6. Commit changes smoothly
    await commit();

    logger.info({
      msg: "Password reset completed.",
      memberId: validation.member.memberId,
    });
    return { success: true, member: validation.member };
  } catch (err) {
    // 7. Safe rollback on any query or hashing failures
    try {
      await rollback();
    } catch (rollbackErr) {
      logger.error({
        msg: "Transaction rollback failed",
        error: rollbackErr.message,
      });
    }
    throw err; // Ensure the controller catches this to send an HTTP 500
  }
}
