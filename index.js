/** @format */
//import jQuery from "jquery";
//import mongoose from "mongoose";
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
//import contactsController from './controllers/contacts.js';
import videos2024Controller from "./controllers/videos2024.js";
import videos2025Controller from "./controllers/videos2025.js";
import teetimesController from "./controllers/tee-times.js";
import { showForm } from "./controllers/formController.js";
import { submitForm } from "./controllers/formController.js";

import firstHalfController from "./controllers/first-half.js";
import secondHalfController from "./controllers/second-half.js";
import overallController from "./controllers/overall.js";
//import availabilityController from "./controllers/availability.js";
//import loginController from "./controllers/loginController.js";
import resultsController from "./controllers/results.js";
import skinsController from "./controllers/skins.js";
import * as dbmodel from "./models/dbModel.js";

const app = new express();

//const uri =
//  "mongodb+srv://golfUser:LJbTwTYnKJZmgIqM@cluster0.ovmegqj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
//const client = new MongoClient(uri);

//dbmodel.connect(client);

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

import ftp from "basic-ftp";

var imageFiles2024 = [];
async function getFilenames() {
    const client = new ftp.Client();

    try {
        await client.access({
            host: "la.storage.bunnycdn.com",
            user: "bottoms-up",
            password: "ac5c1048-f353-4655-8dbe4c573ee9-85ec-4a40",
            secure: false
        });

        const list = await client.list("2024/"); // remote directory

        // Extract filenames into a JS array
        const filenames = list.map(item => item.name);

        console.log(filenames);
        return filenames;

    } catch (err) {
        console.error("FTP Error:", err);
    } finally {
        client.close();
    }
}

imageFiles2024 = getFilenames();

//const directoryPath2024 = "/2024";
//const imageFiles2024 = [];
//var index2024 = 0;

//fs.readdir(directoryPath2024, (err, files) => {
//if (err) {
//console.error("Error reading directory:", err);
//return;
// }
//files.forEach((file) => {
// console.log(file);
//imageFiles2024[index2024] = file;
//index2024++;
//});
//});

const directoryPath2025 = "public/images/2025";
const imageFiles2025 = [];
var index2025 = 0;

fs.readdir(directoryPath2025, (err, files) => {
  if (err) {
    console.error("Error reading directory:", err);
    return;
  }
  files.forEach((file) => {
    console.log(file);
    imageFiles2025[index2025] = file;
    index2025++;
  });
});

app.get("/", homeController);
app.get("/course", courseController);

app.get("/images2024", async (req, res) => {
  res.render("images2024", { items: imageFiles2024 });
});
app.get("/images2025", async (req, res) => {
  res.render("images2025", { items: imageFiles2025 });
});
app.get("/videos2024", videos2024Controller);
app.get("/videos2025", videos2025Controller);

app.get("/results", resultsController);
//app.get("/contacts", contactsController);
app.get("/tee-times", teetimesController);
app.get("/second-half", secondHalfController);
app.get("/first-half", firstHalfController);
app.get("/overall", overallController);
app.get("/skins", skinsController);
app.get("/form", showForm);
app.post("/submit", submitForm);
//app.get("/availability", availabilityController);
//app.get("/login", loginController);

let port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log("app listening on ", port);
});
