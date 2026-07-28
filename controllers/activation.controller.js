import {
  validateActivationToken,
  activateMember,
} from "../services/activation.service.js";

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

    if (password !== confirmPassword) {
      return res.render("activate-account", {
        token,
        member: null,
        error: "Passwords do not match.",
      });
    }

    if (!password || password.trim().length < 10) {
      return res.render("activate-account", {
        token,
        member: validation.member,
        error: "Password must be at least 10 characters.",
      });
    }

    const result = await activateMember(token, password);

    if (!result.success) {
      return res.status(400).render("activation-invalid", {
        reason: result.reason,
      });
    }

    req.flash("success", "Your account has been activated. Please sign in.");

    res.redirect("/login");
  } catch (err) {
    next(err);
  }
}
