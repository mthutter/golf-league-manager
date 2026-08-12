import {
    validateActivationToken,
    activateMember,
    resetPassword
} from "../services/activation.service.js";

import {
    findMemberByEmail,
    resendActivationEmail
} from "../services/account.service.js";

import {
    createToken,
    TOKEN_PURPOSE
} from "../services/activation.service.js";
import {
    sendPasswordResetEmail
} from "../services/email.service.js";
import {
    requestPasswordReset
} from "../services/account.service.js";
import logger from "../utilities/logger.js";

export async function showActivationPage(req, res, next) {
    try {
        const {
            token
        } = req.query;

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
        const {
            token,
            password,
            confirmPassword
        } = req.body;
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
        return res.render("activation-success", {
            member: result.member
        });

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
        const {
            email
        } = req.body;

        if (!email || !email.trim()) {
            return res.render("request-activation", {
                error: "Please enter your email address.",
            });
        }

        const member = await findMemberByEmail(email.trim());
        logger.info("Member lookup complete");
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

export function showForgotPasswordPage(req, res) {
    res.render("auth/forgot-password");
}

export async function handleForgotPassword(req, res) {
    try {
        await requestPasswordReset(req.body.email);
    } catch (err) {
        logger.error(err);
    }

    req.flash("success", "If an account exists for that email address, a password reset link has been sent.");

    res.redirect("/login");
}

export function showResetPasswordPage(req, res) {
    res.render("auth/reset-password", {
        token: req.query.token,
    });
}

export async function handleResetPassword(req, res) {
    const {
        token,
        password,
        confirmPassword
    } = req.body;

    if (!password || !confirmPassword) {
        req.flash("error", "Please enter and confirm your new password.");
        return res.redirect(`/reset-password?token=${token}`);
    }

    if (password !== confirmPassword) {
        req.flash("error", "Passwords do not match.");
        return res.redirect(`/reset-password?token=${token}`);
    }

    try {
        const result = await resetPassword(token, password);

        if (!result.success) {
            let message = "This password reset link is no longer valid.";

            switch (result.reason) {
                case "expired":
                    message = "This password reset link has expired.";
                    break;

                case "used":
                    message = "This password reset link has already been used.";
                    break;

                case "invalid":
                    message = "Invalid password reset link.";
                    break;

                case "inactive":
                    message = "This account has not been activated.";
                    break;
            }

            req.flash("error", message);
            return res.redirect("/login");
        }

        req.flash("success", "Your password has been updated. Please sign in with your new password.");

        res.redirect("/login");
    } catch (err) {
        logger.error(err);

        req.flash("error", "An unexpected error occurred while resetting your password.");

        res.redirect("/login");
    }
}