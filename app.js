// ====== 1. ENVIRONMENT & OTEL MANAGEMENT (MUST REMAIN LINE 1 & 2) ======
import "./config/env.js"; // CRITICAL: Hydrates process.env before anything else compiles!
import "./utilities/otel.js"; // Line 2: Mounts the OpenTelemetry SDK configuration

import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import flash from "connect-flash";
import session from "express-session";
import fileUpload from "express-fileupload";
import { v4 as uuid } from "uuid";
import SQLiteStoreFactory from "connect-sqlite3";

// REVERSE PROXY FOR OTEL LOG/TRACE DATA
import httpProxy from "http-proxy";

// OPENTELEMETRY CONTEXT HELPERS
import { sdk, appLogger } from "./utilities/otel.js";
import logger from "./utilities/logger.js";

// ====== 2. BUSINESS ROUTES (NOW SAFE FROM UNDEFINED ENV CRASHES) ======
import publicRoutes from "./routes/public.routes.js";
import playerRoutes from "./routes/player.routes.js";
import imageRoutes from "./routes/image.routes.js";
import videoRoutes from "./routes/video.routes.js";
import authRoutes from "./routes/auth.routes.js";
import scoreRoutes from "./routes/scores.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import skinsRouter from "./routes/skins.routes.js";
import blogRoutes from "./routes/blog.routes.js";
import emailRoutes from "./routes/email.routes.js";
import groupingRoutes from "./routes/grouping.routes.js";

// MIDDLEWARE
import errorHandler from "./middleware/error.middleware.js";
import authMiddleware from "./middleware/auth.middleware.js";

const app = express();
const SQLiteStore = SQLiteStoreFactory(session);

const proxy = httpProxy.createProxyServer();
const posthogHost = "us.i.posthog.com";

// BLOCK WORDPRESS COMMON EXPLOITS
const blockedPaths = ["/xmlrpc.php", "/wp-admin", "/.env"];

app.use((req, res, next) => {
  if (blockedPaths.some((path) => req.url.includes(path))) {
    // Return a quick 403 Forbidden or 404 without verbose logging
    return res.status(404).send("Not Found");
  }
  next();
});

/* =========================================
   BASIC APP SETTINGS & SECURITY
========================================= */
app.disable("x-powered-by");
app.set("view engine", "ejs");
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));

app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use((req, res, next) => {
  res.setHeader("Permission-Policy", "fullscreen=('*')");
  next();
});

// HTTP PROXY
app.use("/ingest", (req, res) => {
  proxy.web(
    req,
    res,
    {
      target: `https://${posthogHost}`,
      changeOrigin: true,
      secure: true,
    },
    (err) => {
      console.error("Proxy error:", err);
      res.status(502).send("Proxy error");
    },
  );
});

app.locals.siteTitle = process.env.NODE_ENV === "production" ? "Bottoms Up Golf" : process.env.NODE_ENV === "development" ? "Bottoms Up Golf (DEV)" : "Bottoms Up Golf (LOCAL)";

/* =========================================
   PARSERS / STATIC / SESSION
========================================= */
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(fileUpload());

app.use(
  session({
    name: "SessionCookie",
    secret: process.env.EXPRESS_SESSION_SECRET || "golf_secret",
    store: new SQLiteStore({ db: "sessions.db", dir: "./" }),
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 86400000 },
    genid: () => uuid(),
  }),
);

app.use((req, res, next) => {
  res.locals.isAdmin = req.session.isAdmin || false;
  res.locals.isUser = req.session.isUser || false;
  next();
});

app.use(flash());

/* =========================================
   AUTOMATED REQUEST LOGGER MIDDLEWARE
========================================= */
app.use((req, res, next) => {
  const distinctId = req.session?.id || req.sessionID || "anonymous_server_user";
  const isStaticAsset = req.path.includes(".") || req.path.startsWith("/images") || req.path.startsWith("/videos");

  if (!isStaticAsset) {
    appLogger.emit({
      severityText: "INFO",
      body: `HTTP ${req.method} ${req.path}`,
      attributes: {
        "http.method": req.method,
        "http.target": req.path,
        "http.host": req.get("host"),
        posthogDistinctId: distinctId,
      },
    });
  }
  next();
});

/* =========================================
   ROUTES REGISTER
========================================= */
app.use("/", publicRoutes);
app.use("/", groupingRoutes);
app.use("/blog", blogRoutes);
app.use("/players", playerRoutes);
app.use("/images", imageRoutes);
app.use("/videos", videoRoutes);
app.use("/scores", scoreRoutes);
app.use("/admin", adminRoutes);
app.use("/skins", skinsRouter);
app.use("/email", emailRoutes);

/* ========================================= ERROR CODES ========================================= */
app.use((req, res, next) => {
  const err = new Error("The requested page or asset could not be found.");
  err.status = 404;
  next(err);
});

app.use(errorHandler);

/* =========================================================================================
   PORT BINDING & CRASH HOOKS (KEEPS APPLICATION RUNNING CONTINUOUSLY ON MAPPED PORTS)
========================================================================================= */
const PORT = process.env.PORT || 8080;

const server = app.listen(PORT, () => {
  logger.info(`Bottoms Up Golf application started on port ${PORT}`);

  appLogger.emit({
    severityText: "INFO",
    body: "Telemetry system connection verified.",
    attributes: {
      environment: process.env.NODE_ENV || "local",
      posthogDistinctId: "server_boot_agent",
    },
  });
});

// Capture unexpected errors and flush before shutting down
process.on("uncaughtException", async (err) => {
  if (err.code === "ERR_HTTP_HEADERS_SENT" || err.message.includes("headers after they are sent")) {
    return;
  }
  appLogger.emit({
    severityText: "FATAL",
    body: `CRITICAL Uncaught Exception: ${err.message}`,
    attributes: { "error.stack": err.stack, posthogDistinctId: "server_crash_agent" },
  });
  await sdk.shutdown();
  process.exit(1);
});

process.on("unhandledRejection", async (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  appLogger.emit({
    severityText: "ERROR",
    body: `WARNING Unhandled Rejection: ${err.message}`,
    attributes: { "error.stack": err.stack, posthogDistinctId: "server_crash_agent" },
  });
  await sdk.shutdown();
});

const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Flushing telemetry queue...`);
  await sdk.shutdown();
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export default app;
