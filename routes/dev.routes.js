import express from "express";
import bcrypt from "bcrypt";

import { authenticate } from "../services/auth.service.js";
import { get, run } from "../config/db.js";
import { createActivationToken } from "../services/activation.service.js";

const router = express.Router();

router.get("/auth-test", async (req, res, next) => {
  try {
    const user = await authenticate("mthutter@me.com", "!Peter021");

    res.json(user ?? { success: false });
  } catch (err) {
    next(err);
  }
});

router.get("/bootstrap-admin", async (req, res, next) => {
  try {
    const email = "mthutter@me.com".trim().toLowerCase();
    const password = "!Peter021";

    const member = await get(
      `
      SELECT id, e_mail
      FROM members
      WHERE e_mail = ?
      `,
      [email],
    );

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member not found.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await run(
      `
      UPDATE members
      SET
        password_hash = ?,
        is_active = 1,
        email_verified = 1
      WHERE id = ?
      `,
      [passwordHash, member.id],
    );

    res.json({
      success: true,
      message: "Account initialized successfully.",
      memberId: member.id,
    });
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

export default router;
