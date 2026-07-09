import "./config/env.js"; 
import app from "./app.js";
import logger from "./utilities/logger.js"; // Import your new Pino logger instance

// 1. Catch synchronous bugs thrown outside Express execution loops
process.on("uncaughtException", (err) => {
  logger.fatal(
    { err: { message: err.message, stack: err.stack } }, 
    "CRITICAL: Uncaught Exception detected. Shutting down application gracefully..."
  );
  // Give the server time to log before exiting the process
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
