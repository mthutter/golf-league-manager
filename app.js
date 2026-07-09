// ====== 1. OPENTELEMETRY INITIALIZATION (MUST REMAIN AT THE ABSOLUTE TOP) ======
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
// Added SimpleLogRecordProcessor and ConsoleLogRecordExporter for local visibility
import { BatchLogRecordProcessor, SimpleLogRecordProcessor, ConsoleLogRecordExporter } from "@opentelemetry/sdk-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    "service.name": "my-node-service",
  }),
  // We wrap both processors in an array so it logs locally AND sends to PostHog
  logRecordProcessors: [
    // Destination A: PostHog (Batched for production performance)
    new BatchLogRecordProcessor(
      new OTLPLogExporter({
        url: "https://us.i.posthog.com",
        headers: {
          Authorization: "Bearer phc_sv3aBkEY4DE4wejGWfMHfNYxCUpDBxBc6iVRsJu7Q47t",
        },
      }),
    ),
    // Destination B: Your local terminal screen (Instant, no batching delays)
    new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()),
  ],
});

// Start the SDK immediately
sdk.start();

// ====== 2. REGULAR APPLICATION IMPORTS ======
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import flash from "connect-flash";
import session from "express-session";
import fileUpload from "express-fileupload";
import { v4 as uuid } from "uuid";
import SQLiteStoreFactory from "connect-sqlite3";

// ROUTES
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

// ... Rest of your app.js code remains exactly the same
const app = express();

const SQLiteStore = SQLiteStoreFactory(session);

/* =========================================
   BASIC APP SETTINGS
========================================= */

app.disable("x-powered-by");
app.set("view engine", "ejs");
app.set("trust proxy", 1);

/* =========================================
   SECURITY
========================================= */

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use((req, res, next) => {
  res.setHeader("Permission-Policy", "fullscreen=('*')");
  next();
});

/*==========================================
   Environment
========================================= */

app.locals.siteTitle =
  process.env.NODE_ENV === "production"
    ? "Bottoms Up Golf"
    : process.env.NODE_ENV === "development"
      ? "Bottoms Up Golf (DEV)"
      : process.env.NODE_ENV === "local"
        ? "Bottoms Up Golf (LOCAL)"
        : "UNKNOWN";

/* =========================================
   PARSERS / STATIC
========================================= */

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(fileUpload());

/* =========================================
   SESSION / FLASH
========================================= */

app.use(
  session({
    name: "SessionCookie",
    secret: process.env.EXPRESS_SESSION_SECRET,
    store: new SQLiteStore({
      db: "sessions.db",
      dir: "./",
    }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 86400000,
    },
    genid: () => uuid(),
  }),
);

app.use((req, res, next) => {
  // Binds session data straight to EJS global context templates
  res.locals.isAdmin = req.session.isAdmin || false;
  res.locals.isUser = req.session.isUser || false;
  next();
});

app.use(flash());

/* =========================================
   ROUTES
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

/* ========================================= 404 HANDLER ========================================= */
app.use((req, res, next) => {
  const err = new Error("The requested page or asset could not be found.");
  err.status = 404;
  next(err); // Forwards straight to your errorHandler middleware
});

/* ========================================= ERROR HANDLER ========================================= */
app.use(errorHandler);

export default app;
