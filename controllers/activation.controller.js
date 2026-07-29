import { validateActivationToken, activateMember } from "../services/activation.service.js";

import { findMemberByEmail, resendActivationEmail } from "../services/account.service.js";

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

    // 1. Run the database activation service
    const result = await activateMember(token, password);

    // 2. Handle unexpected service-level validation failures
    if (!result.success) {
      return res.status(400).render("activation-invalid", {
        reason: result.reason || "invalid",
      });
    }

    // 3. ✅ FIX: Send a response to the browser to stop the spinning loader
    // Option A: Render a success page
    return res.render("activation-success", { member: result.member });

    // Option B (Alternative): If your UI uses AJAX/Fetch, return JSON instead:
    // return res.status(200).json({ success: true });
  } catch (err) {
    next(err); // Forwards unexpected crashes to your global error handler
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

    if (member.is_active) {
      return {
        success: false,
        reason: "already-active",
      };
    }
    await resendActivationEmail(member.id);

    return res.render("activation-requested");
  } catch (err) {
    next(err);
  }
}
