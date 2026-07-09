import "./config/env.js"; 
import app from "./app.js";
import logger from "./utilities/logger.js"; // Import your new Pino logger instance

// 1. Catch synchronous bugs thrown outside Express execution loops
process.on("uncaughtException", (err) => {
  // Gracefully skip execution crashes caused strictly by Render deployment network race conditions
  if (err.code === "ERR_HTTP_HEADERS_SENT" || err.message.includes("headers after they are sent")) {
    logger.error(
      { err: { message: err.message, stack: err.stack } }, 
      "Express double-header conflict caught safely during lifecycle cycle. Skipping process termination."
    );
    return; // Keeps the server online
  }

  // Terminate only on completely fatal operational errors (e.g. out of memory, missing port)
  logger.fatal({ err: { message: err.message, stack: err.stack } }, "CRITICAL: Uncaught Exception. Shutting down...");
  process.exit(1);
});

// 2. Catch asynchronous rejections (e.g., dropped SQLite or Database connections)
process.on("unhandledRejection", (reason) => {
  logger.error(
    { reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason }, 
    "WARNING: Unhandled Promise Rejection detected."
  );
});

const PORT = process.env.PORT || 3000;

// Start the server using the structured logger
app.listen(PORT, () => {
  logger.info(`Bottoms Up Golf application started on port ${PORT}`);
});
