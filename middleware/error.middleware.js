import logger from "../utilities/logger.js";
import posthog from "../utilities/posthog.js";
import { appLogger } from "../utilities/otel.js";

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  const statusCode = err.status || err.statusCode || 500;

  // 1. Capture exception in PostHog
  posthog.captureException(err, req.session?.id || "anonymous", {
    method: req.method,
    url: req.url,
    status_code: statusCode,
  });

  // 2. Log structured JSON error details
  logger.error(
    {
      err: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
      context: {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userId: req.session?.userId || "anonymous", // Helpful for tracking user errors
      },
    },
    `Application Error: ${err.message}`,
  );

  // 2. Render your error page or send JSON response
  res.status(statusCode);

  // Checks if client expects HTML (like EJS views) or JSON (like API calls)
  if (req.accepts("html")) {
    return res.render("error", {
      message: statusCode === 500 ? "Internal Server Error" : err.message,
      status: statusCode,
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
