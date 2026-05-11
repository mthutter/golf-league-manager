import ftp from "basic-ftp";
import fs from "fs";
import express from "express";
import bodyParser from "body-parser";
import flash from "connect-flash";
import expressSession from "express-session";
import { MemoryStore } from "express-session";
import fileUpload from "express-fileupload";
import { v4 as uuid } from "uuid";
import { MongoClient } from "mongodb";
import cookieParser from "cookie-parser";
import homeController from "./controllers/home.js";
import courseController from "./controllers/course.js";
import videos2024Controller from "./controllers/videos2024.js";
import videos2025Controller from "./controllers/videos2025.js";
import videosController from "./controllers/videos.js";
import teetimesController from "./controllers/tee-times.js";
import addPlayerForm from "./controllers/add-player-form.js";
import { showForm } from "./controllers/formController.js";
import { submitForm } from "./controllers/formController.js";

import firstHalfController from "./controllers/first-half.js";
import secondHalfController from "./controllers/second-half.js";
import overallController from "./controllers/overall.js";
import rulesController from "./controllers/rules.js";
import resultsController from "./controllers/results.js";
import skinsController from "./controllers/skins.js";
import * as dbmodel from "./models/dbModel.js";

import sqlite3 from "sqlite3";

const app = new express();

app.disable("x-powered-by");
app.set("view engine", "ejs");
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader("Permission-Policy", "fullscreen=('*')");
  next();
});

//app.use(helmet());
//app.use(
//helmet.contentSecurityPolicy({
//directives: {
//scriptSrc: ["'self' data:", "fonts.gstatic.com", "fonts.googleapis.com", "static.elfsight.com", "cdn.jsdelivr.net"],
//connectSrc: ["'self'", "core.service.elfsight.com", "cdn.jsdelivr.net"],
//imgSrc: ["'self' data:", "'self'", "fonts.gstatic.com", "fonts.googleapis.com", "cdn.jsdelivr.net/npm/bootstrap@5.3.3", "static.elfsight.com", "files.elfsightcdn.com", "www.w3.org"],
//},
//})
//);
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(fileUpload());
app.use(flash());
app.use(
  expressSession({
    name: "SessionCookie",
    cookie: { maxAge: 60000 },
    secret: "woot",
    store: new MemoryStore({ checkPeriod: 86400000 }),
    resave: false,
    saveUninitialized: false,
    genid: (req) => {
      return uuid();
    },
  })
);

async function getFilenames(year) {
  const client = new ftp.Client();
  try {
    await client.access({
      host: "la.storage.bunnycdn.com",
      user: "bottoms-up",
      password: "ac5c1048-f353-4655-8dbe4c573ee9-85ec-4a40",
      secure: false,
    });

    const list = await client.list(year + "/"); // FTP folder
    return list.map((item) => item.name); // Get names only
  } catch (err) {
    console.error("FTP Error:", err);
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

app.get("/images", async (req, res) => {
  const filenames = await getFilenames("2025");
  res.render("images", { filenames });
});

app.get("/", homeController);
app.get("/course", courseController);
app.get("/videos2024", videos2024Controller);
app.get("/videos2025", videos2025Controller);
app.get("/videos", videosController);
app.get("/results", resultsController);
app.get("/tee-times", teetimesController);
app.get("/rules", rulesController);
app.get("/overall", overallController);
app.get("/skins", skinsController);

const db = new sqlite3.Database("./golf-league-db.db", (err) => {
  if (err) console.error(err.message);
  console.log("Connected to the SQLite database.");
});
app.get("/add-player-form", addPlayerForm);

app.post("/add-player", function (req, res) {
  const { name_last, name_first, phone, handicap, password, e_mail, year_joined } = req.body;
  const sql = `INSERT INTO members (name_last, name_first, phone, handicap, password, e_mail, year_joined) VALUES (?, ?, ?, ?, ?, ?, ?)`;

  console.log(name_last, name_first);

  db.run(sql, [name_last, name_first, phone, handicap, password, e_mail, year_joined], function (err) {
    if (err) return console.error(err.message);
    console.log(`A row has been inserted with rowid ${this.lastID}`);
    res.redirect("/");
  });
});

app.get("/players", function (req, res) {
  const sql = `
    SELECT
      id,
      name_last,
      name_first,
      phone,
      handicap,
      e_mail,
      year_joined
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

let port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log("app listening on ", port);
});
