import logger from "../utilities/logger.js";
import {
    ROLES
} from "../services/roles.service.js";

/**
 * Require a logged-in user.
 */
export function requireAuth(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }

    logger.warn({
        msg: "Unauthorized access attempt",
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
    });

    req.flash("error", "Please log in to continue.");
    return res.redirect("/login");
}

/**
 * Factory for requiring a specific role.
 */
export function requireRole(role) {
    return (req, res, next) => {
        if (!req.isAuthenticated()) {
            req.flash("error", "Please log in to continue.");
            return res.redirect("/login");
        }

        if (req.user?.roles?.includes(role)) {
            return next();
        }

        logger.warn({
            msg: "Access denied",
            userId: req.user.id,
            email: req.user.email,
            requiredRole: role,
            roles: req.user.roles,
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
        });

        return res.status(403).render("errors/403", {
            title: "Access Denied",
        });
    };
}

export const requireAdmin = requireRole(ROLES.ADMIN);
export const requireMember = requireRole(ROLES.MEMBER);
export const requireCommissioner = requireRole(ROLES.COMMISSIONER);
export const requireTreasurer = requireRole(ROLES.TREASURER);