// ====== 1. ENVIRONMENT (MUST REMAIN LINE 1) ======
import "./config/env.js"; // CRITICAL: Hydrates process.env before anything else compiles!
import sqlite3 from "sqlite3";
import path from "path";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import flash from "connect-flash";
import session from "express-session";
import { v4 as uuid } from "uuid";
import SQLiteStoreFactory from "connect-sqlite3";
import cors from "cors";
import logger from "./utilities/logger.js";
import passport from "./config/passport.js";
import { ROLES } from "./services/roles.service.js";
import posthogClient from "./utilities/posthog.js";

// ====== 2. ROUTES ======
import publicRoutes from "./routes/public.routes.js";
import playerRoutes from "./routes/player.routes.js";
import imageRoutes from "./routes/image.routes.js";
import videoRoutes from "./routes/video.routes.js";
import scoreRoutes from "./routes/scores.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import skinsRouter from "./routes/skins.routes.js";
import blogRoutes from "./routes/blog.routes.js";
import emailRoutes from "./routes/email.routes.js";
import groupingRoutes from "./routes/grouping.routes.js";
import devRoutes from "./routes/dev.routes.js";
import activationRoutes from "./routes/activation.routes.js";

import * as activationController from "./controllers/activation.controller.js";

// MIDDLEWARE
import errorHandler from "./middleware/error.middleware.js";

const app = express();
logger.info(`Starting Bottoms Up Golf (${process.env.NODE_ENV})`);

const SQLiteStore = SQLiteStoreFactory(session);
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: "Too many requests from this IP, please try again later.",
});

app.get("/favicon.ico", (req, res) => {
  res.sendFile(path.join(process.cwd(), "icons", "icons8-golf-lineal-color-32.png"));
});

// SILENCE CHROME DEVTOOLS WORKSPACE DISCOVERY ALERTS
app.use((req, res, next) => {
  if (req.url.includes(".well-known/appspecific")) {
    return res.status(404).end();
  }
  next();
});

// CORS: Enforces secure multi-environment transport
app.use(
  cors({
    origin: ["http://localhost:8080", "https://t.bottoms-up-cos.org"],
    credentials: true,
  }),
);

/* ====== BASIC APP SETTINGS & SECURITY ====== */
app.disable("x-powered-by");
app.set("view engine", "ejs");
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(limiter);

/* ====== SECURITY WALL: IP & MALICIOUS PATH BLOCKING ====== */
const bannedIPInput = ["172.71.151.229, 172.70.248.180, 172.71.151.230, 172.71.151.210,	172.71.151.221"];

const bannedIPs = new Set(bannedIPInput.flatMap((item) => item.split(",")).map((ip) => ip.trim()));
const blockedPaths = ["wlwmanifest.xml", "xmlrpc.php", "wp-admin", "wp-config", "wp-content", ".env"];
const blockedExtensions = [".php", ".asp", ".aspx", ".env"];

app.use((req, res, next) => {
  // FIX: Express's req.ip natively respects 'trust proxy 1' and safely parses x-forwarded-for
  const visitorIP = req.ip;
  const lowerPath = req.path.toLowerCase();

  const matchesIP = visitorIP && bannedIPs.has(visitorIP);
  const matchesPath = blockedPaths.some((path) => lowerPath.includes(path));
  const matchesExtension = blockedExtensions.some((ext) => lowerPath.endsWith(ext));

  if (matchesIP || matchesPath || matchesExtension) {
    let blockReason = "Malicious File/Path Scan";
    if (matchesIP) blockReason = "Banned IP Address";

    posthogClient.capture({
      distinctId: visitorIP || "unknown_bot",
      event: "bot_attack_blocked",
      properties: {
        $ip: visitorIP,
        requested_path: req.path,
        block_reason: blockReason,
        user_agent: req.headers["user-agent"],
      },
    });

    const statusCode = matchesIP ? 403 : 404;
    const msg = matchesIP ? "Access Denied" : "Not Found";
    return res.status(statusCode).send(msg);
  }
  next();
});
/* ========================================================= */

app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use((req, res, next) => {
  res.setHeader("Permission-Policy", "fullscreen=('*')");
  next();
});

// NOTE: PostHog Proxy routes have been completely removed.
// Client tracking maps directly to your t.bottoms-up-cos.org DNS records.

app.locals.siteTitle = process.env.NODE_ENV === "production" ? "Bottoms Up Golf" : process.env.NODE_ENV === "development" ? "Bottoms Up Golf (DEV)" : "Bottoms Up Golf (UNK)";

/* ====== PARSERS / STATIC / SESSION ====== */
app.use(express.static("public"));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());

const sessionDb = new sqlite3.Database(path.join(process.env.EXPRESS_SESSION_DB_PATH, "sessions.db"));

app.use(
  session({
    name: "SessionCookie",
    secret: process.env.EXPRESS_SESSION_SECRET,
    store: new SQLiteStore({
      db: sessionDb,
      dir: process.env.EXPRESS_SESSION_DB_PATH,
    }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    genid: () => uuid(),
  }),
);

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

app.use((req, res, next) => {
  const user = req.user;

  res.locals.user = user;
  res.locals.isAuthenticated = req.isAuthenticated();
  res.locals.isAdmin = user?.roles?.includes(ROLES.ADMIN) ?? false;
  res.locals.isMember = user?.roles?.includes(ROLES.MEMBER) ?? false;

  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");

  next();
});

/* ====== ROUTES REGISTER ======= */
/* ====== DEV ROUTES ====== */
if (process.env.NODE_ENV == "production" || process.env.NODE_ENV == "development") {
  app.use("/dev", devRoutes);
}

/* ====== PRODUCTION ROUTES ====== */
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
app.use("/activate", activationRoutes);

app.get("/forgot-password", activationController.showForgotPasswordPage);
app.post("/forgot-password", activationController.handleForgotPassword);

app.get("/reset-password", activationController.showResetPasswordPage);
app.post("/reset-password", activationController.handleResetPassword);

app.use(errorHandler);

/* ====== PORT BINDING & CRASH HOOKS ====== */
const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => {
  logger.info(`Bottoms Up Golf application started on port ${PORT}`);
});

process.on("uncaughtException", async (err) => {
  if (err.code === "ERR_HTTP_HEADERS_SENT" || err.message.includes("headers after they are sent")) {
    return;
  }
  logger.error(err);
  process.exit(1);
});

process.on("unhandledRejection", async (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));

  logger.error(err);
});

const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Gracefully shutting down...`);

  server.close(() => {
    logger.info("HTTP server closed.");
    process.exit(0);
  });
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export default app;
