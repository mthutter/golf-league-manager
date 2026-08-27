// utilities/logger.js
import pino from "pino";

const isDevelopment = process.env.NODE_ENV === "development";

// 🟢 THE PRODUCTION LOCAL TIME ADJUSTMENT:
// Forces your live production JSON output stream to respect the system TZ clock settings.
const productionLocalTimestamp = () => {
  const localDate = new Date().toLocaleString("en-US", {
    timeZone: process.env.TZ || "America/Denver",
  });
  return `,"time":"${localDate}"`;
};

const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info"),

  // 🚀 DYNAMIC TIME SWITCH: Uses pretty formatting locally, and localized JSON strings in production
  timestamp: isDevelopment ? pino.stdTimeFunctions.isoTime : productionLocalTimestamp,

  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },

  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard", // Natively pulls your laptop's clock locally
          ignore: "pid,hostname",
        },
      }
    : undefined,
});

export default logger;
