import pino from "pino";

const isDevelopment = process.env.NODE_ENV === "development";

const logger = pino({
    // Use your existing level check, falling back to 'debug' in dev if not set
    level: process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info"),

    // High-performance ISO timestamps
    timestamp: pino.stdTimeFunctions.isoTime,

    formatters: {
        // Keeps your custom uppercase level formatting for production JSON
        level: (label) => ({
            level: label.toUpperCase()
        }),
    },

    // Conditionally inject pino-pretty for local terminals
    transport: isDevelopment ?
        {
            target: "pino-pretty",
            options: {
                colorize: true,
                translateTime: "SYS:standard", // Pretty dates locally
                ignore: "pid,hostname", // Hides noise in local terminal
            },
        } :
        undefined, // Standard, blazing-fast JSON stream in production
});

export default logger;