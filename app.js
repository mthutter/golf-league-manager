import express from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import flash from "connect-flash";
import session from "express-session";
import { MemoryStore } from "express-session";
import fileUpload from "express-fileupload";
import { v4 as uuid } from "uuid";

// ROUTES
import publicRoutes from "./routes/public.routes.js";
import playerRoutes from "./routes/player.routes.js";
import imageRoutes from "./routes/image.routes.js";

// MIDDLEWARE
import errorHandler from "./middleware/error.middleware.js";

dotenv.config();

const app = express();

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
  })
);

app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use((req, res, next) => {
  res.setHeader("Permission-Policy", "fullscreen=('*')");
  next();
});

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

    store: new MemoryStore({
      checkPeriod: 86400000,
    }),

    resave: false,

    saveUninitialized: false,

    cookie: {
      maxAge: 86400000,
    },

    genid: () => uuid(),
  })
);

app.use(flash());

/* =========================================
   ROUTES
========================================= */

app.use("/", publicRoutes);

app.use("/players", playerRoutes);

app.use("/images", imageRoutes);

/* =========================================
   404 HANDLER
========================================= */

app.use((req, res) => {
  res.status(404).render("404");
});

/* =========================================
   ERROR HANDLER
========================================= */

app.use(errorHandler);

export default app;
