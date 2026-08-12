import logger from "../utilities/logger.js";
import posthog from "../utilities/posthog.js";

const errorHandler = (err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    const statusCode = err.status || err.statusCode || 500;

    // 1. Only capture system crashes in PostHog (ignores expected 404 noise)
    if (statusCode !== 404) {
        posthog.captureException(err, req.session?.id || "anonymous", {
            method: req.method,
            url: req.url,
            status_code: statusCode,
        });
    }

    // 2. Log details internally for your debugging records
    logger.error({
            err: {
                name: err.name,
                message: err.message,
                stack: err.stack
            },
            context: {
                method: req.method,
                url: req.url,
                ip: req.ip,
                userId: req.session?.userId || "anonymous"
            },
        },
        `Application Error: ${err.message}`,
    );

    // 3. Render unified layout or return JSON payload
    res.status(statusCode);

    if (req.accepts("html")) {
        return res.render("error", {
            // Core error indicators
            message: statusCode === 500 ? "Internal Server Error" : err.message,
            status: statusCode,

            // Global navigation contexts to safeguard EJS templates
            user: req.user || null,
            isAuthenticated: typeof req.isAuthenticated === "function" ? req.isAuthenticated() : false,
            isAdmin: req.user?.roles?.includes("ADMIN") ?? false,
            isMember: req.user?.roles?.includes("MEMBER") ?? false,
            success: req.flash ? req.flash("success") : [],
            error: req.flash ? req.flash("error") : [], // Replaces old error variable
        });
    }

    return res.json({
        error: {
            status: statusCode,
            message: statusCode === 500 ? "Internal Server Error" : err.message,
        },
    });
};

export default errorHandler;