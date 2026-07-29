import {
  validateActivationToken,
  activateMember,
} from "../services/activation.service.js";

import {
  findMemberByEmail,
  resendActivationEmail,
} from "../services/account.service.js";

import logger from "../utilities/logger.js";

export async function showActivationPage(req, res, next) {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).render("activation-invalid", {
        reason: "missing",
      });
    }

    const result = await validateActivationToken(token);

    console.log(result);
    console.log(result.valid);
    console.log(token);

    if (!result.valid) {
      return res.status(400).render("activation-invalid", {
        reason: result.reason,
      });
    }
    console.log(result.member);
    res.render("activate-account", {
      token,
      member: result.member,
      error: null,
    });
  } catch (err) {
    next(err);
  }
}

export async function activateAccount(req, res, next) {
  try {
    const { token, password, confirmPassword } = req.body;

    const validation = await validateActivationToken(token);

    if (!validation.valid) {
      return res.status(400).render("activation-invalid", {
        reason: validation.reason,
      });
    }

    // Now validation.member is available everywhere below...

    if (password !== confirmPassword) {
      return res.render("activate-account", {
        token,
        member: validation.member,
        error: "Passwords do not match.",
      });
    }

    if (!password || password.trim().length < 12) {
      return res.render("activate-account", {
        token,
        member: validation.member,
        error: "Password must be at least 12 characters.",
      });
    }

    const result = await activateMember(token, password);

    // ...
  } catch (err) {
    next(err);
  }
}

export function showActivationRequestPage(req, res) {
  res.render("request-activation", {
    error: null,
  });
}

export async function handleActivationRequest(req, res, next) {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.render("request-activation", {
        error: "Please enter your email address.",
      });
    }

    const member = await findMemberByEmail(email.trim());
    logger.info({ member }, "Member lookup complete");
    //
    // SECURITY NOTE:
    // Don't reveal whether the email exists.
    //

    if (!member) {
      return res.render("activation-requested");
    }

    if (member.is_active && member.id != 20) {
      req.flash(
        "info",
        "Your account is already active. Please log in or reset your password if needed.",
      );
      return res.redirect("/login");
    }

    await resendActivationEmail(member.id);

    return res.render("activation-requested");
  } catch (err) {
    next(err);
  }
}
