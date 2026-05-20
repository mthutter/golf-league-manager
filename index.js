import ftp from "basic-ftp";
import express from "express";
import bodyParser from "body-parser";
import flash from "connect-flash";
import expressSession from "express-session";
import { MemoryStore } from "express-session";
import fileUpload from "express-fileupload";
import { v4 as uuid } from "uuid";
import sqlite3 from "sqlite3";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import basicAuth from "express-basic-auth";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import helmet from "helmet";

import homeController from "./controllers/home.js";
import courseController from "./controllers/course.js";
import videos2024Controller from "./controllers/videos2024.js";
import videos2025Controller from "./controllers/videos2025.js";
import teetimesController from "./controllers/tee-times.js";
import addPlayerForm from "./controllers/add-player-form.js";
import overallController from "./controllers/overall.js";
import rulesController from "./controllers/rules.js";
import resultsController from "./controllers/results.js";
import skinsController from "./controllers/skins.js";

const app = new express();

dotenv.config();

app.use(cookieParser());
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.disable("x-powered-by");
app.set("view engine", "ejs");
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader("Permission-Policy", "fullscreen=('*')");
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(fileUpload());
app.use(flash());
app.use(
  expressSession({
    name: "SessionCookie",
    cookie: { maxAge: 86400000 },
    secret: "woot",
    store: new MemoryStore({ checkPeriod: 86400000 }),
    resave: false,
    saveUninitialized: false,
    genid: (req) => {
      return uuid();
    },
  })
);

//basic auth for 'app-player-form'
const myAuth = basicAuth({
  users: { [process.env.ADMIN_USER]: process.env.ADMIN_PASS },
  challenge: true, // This triggers the browser login prompt
  unauthorizedResponse: "Direct access denied.",
});

async function getFilenames(year) {
  const client = new ftp.Client();
  try {
    await client.access({
      host: process.env.BUNNY_HOST,
      user: process.env.BUNNY_USER,
      password: process.env.BUNNY_PASS,
      secure: false,
    });
    const list = await client.list(year + "/"); // FTP folder
    return list.map((item) => item.name); // Get names only
  } catch (err) {
    console.error("FTP Connection Error:", err);
    return [];
  } finally {
    client.close();
  }
}

app.get("/images2024", async (req, res) => {
  const filenames = await getFilenames("2024");
  res.render("images2024", { filenames });
});

app.get("/images2025", async (req, res) => {
  const filenames = await getFilenames("2025");
  res.render("images2025", { filenames });
});

app.get("/images2026", async (req, res) => {
  const filenames = await getFilenames("2026");
  res.render("images2026", { filenames });
});

app.get("/", homeController);
app.get("/course", courseController);
app.get("/videos2024", videos2024Controller);
app.get("/videos2025", videos2025Controller);
app.get("/results", resultsController);
app.get("/tee-times", teetimesController);
app.get("/rules", rulesController);
app.get("/overall", overallController);
app.get("/skins", skinsController);

const db = new sqlite3.Database("./golf-league-db.db", (err) => {
  if (err) console.error(err.message);
  console.log("Connected to the SQLite database.");
});

//app.get("/add-player-form", addPlayerForm);

app.post("/add-player", myAuth, function (req, res) {
  const { name_last, name_first, phone, handicap, password, e_mail, year_joined, status, type } = req.body;
  const sql = `INSERT INTO members (name_last, name_first, phone, handicap, password, e_mail, year_joined, status, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  console.log(name_last, name_first);

  if (!name_first || !name_last) {
    return res.send("Missing required fields");
  }

  db.run(sql, [name_last, name_first, phone, handicap, password, e_mail, year_joined, status, type], function (err) {
    if (err) return console.error(err.message);
    console.log(`A row has been inserted with rowid ${this.lastID}`);
    res.redirect("/players");
  });
});

app.get("/players", myAuth, function (req, res) {
  const sql = `
    SELECT
      id,
      name_last,
      name_first,
      phone,
      handicap,
      e_mail,
      year_joined,
      status,
      type
    FROM members
    ORDER BY id ASC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error(err.message);

      return res.status(500).send("Database Error");
    }

    console.log(rows);

    res.render("players", {
      players: rows,
    });
  });
});

// Protect only the specific route
app.get("/add-player-form", myAuth, (req, res) => {
  res.render("add-player-form");
});

let port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log("app listening on ", port);
});
