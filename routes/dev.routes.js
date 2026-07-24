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

router.get("/activation-test/:id", async (req, res) => {
  const token = await createActivationToken(req.params.id);

  res.json({
    token,
  });
});

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

export default router;
