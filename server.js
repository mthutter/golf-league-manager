import "./config/env.js";
import app from "./app.js";
import logger from "./utilities/logger.js";
import { appLogger, loggerProvider } from "./utilities/otel.js";
import posthog from "./utilities/posthog.js"; // Import PostHog to handle process exits

// 1. Catch synchronous bugs thrown outside Express execution loops
process.on("uncaughtException", async (err) => {
  // Gracefully skip execution crashes caused strictly by Render deployment network race conditions
  if (err.code === "ERR_HTTP_HEADERS_SENT" || err.message.includes("headers after they are sent")) {
    logger.error({ err: { message: err.message, stack: err.stack } }, "Express double-header conflict caught safely during lifecycle cycle. Skipping process termination.");
    return; // Keeps the server online
  }

  // Track the crash in PostHog
  posthog.captureException({ exception: err, distinctId: "server_crash" });

  // Terminate only on completely fatal operational errors
  logger.fatal({ err: { message: err.message, stack: err.stack } }, "CRITICAL: Uncaught Exception. Shutting down...");

  // CRITICAL: Flush remaining events to PostHog before exiting
  await posthog.shutdownAsync();
  process.exit(1);
});

// 2. Catch asynchronous rejections (e.g., dropped SQLite or Database connections)
process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));

  // Track the unhandled rejection in PostHog
  posthog.captureException({ exception: err, distinctId: "server_unhandled_rejection" });

  logger.error({ reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason }, "WARNING: Unhandled Promise Rejection detected.");
});

const PORT = process.env.PORT || 3000;

// Capture the server instance to manage clean closure
const server = app.listen(PORT, () => {
  logger.info(`Bottoms Up Golf application started on port ${PORT}`);

  appLogger.emit({
    severityText: "INFO",
    body: "OTel Logger Subsystem successfully mounted to PostHog endpoint.",
    attributes: { environment: process.env.NODE_ENV || "local" },
  });
});

// 3. Graceful shutdown handler for standard deployment restarts (like Render/Heroku)
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Cleaning memory queues and stopping server...`);

  // Force PostHog to flush all remaining events to the cloud dashboard
  await posthog.shutdownAsync();

  server.close(() => {
    logger.info("HTTP server closed. Process terminated clean.");
    process.exit(0);
  });
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
