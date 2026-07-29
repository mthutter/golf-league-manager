import express from "express";
import bcrypt from "bcrypt";
import { authenticate } from "../services/auth.service.js";
import { get, run } from "../config/db.js";
import { createActivationToken } from "../services/activation.service.js";
import * as accountService from "../services/account.service.js";
import { ROLES } from "../services/roles.service.js";

const router = express.Router();

router.get("/auth-test", async (req, res, next) => {
  try {
    const user = await authenticate("mthutter@me.com", "!Peter021");

    res.json(user ?? { success: false });
  } catch (err) {
    next(err);
  }
});

router.get("/whoami", (req, res) => {
  res.json({
    authenticated: req.isAuthenticated(),
    sessionID: req.sessionID,
    user: req.user,
  });
});

// Manually activiate a provisioned user account via member_id
router.get("/activation-test/:id", async (req, res) => {
  const token = await createActivationToken(req.params.id);

  res.json({
    token,
  });
});

// Manually provision user account via member_id
router.get("/provision/:id", async (req, res, next) => {
  try {
    const member = await get(
      `
      SELECT
        id,
        name_first,
        e_mail
      FROM members
      WHERE id = ?
      `,
      [req.params.id],
    );

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member not found.",
      });
    }

    const result = await accountService.initializeAccount(member.id, {
      roles: [ROLES.MEMBER, ROLES.ADMIN],
      sendActivationEmail: true,
      email: member.e_mail,
      firstName: member.name_first,
    });

    res.json({
      success: true,
      memberId: member.id,
      result,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/cleanse-test-user", async (req, res, next) => {
  try {
    const query = `
      UPDATE members 
      SET password_hash = NULL, 
          last_login = NULL, 
          email_verified = 0, 
          is_active = 0, 
          activated_at = NULL 
      WHERE id = 20
    `;

    // Uses your native async 'run' wrapper from ../config/db.js
    const result = await run(query);

    // sqlite3 run() wrapper returns an object containing the changes property
    if (result && result.changes === 0) {
      return res.status(404).json({ success: false, error: "Test user not found" });
    }

    return res.status(200).json({ success: true, message: "Test user values cleared successfully" });
  } catch (error) {
    next(error);
  }
});

export default router;
