import express from "express";

import homeController from "../controllers/home.js";
import courseController from "../controllers/course.js";
import resultsController from "../controllers/results.js";
import skinsController from "../controllers/skins.js";
import overallController from "../controllers/overall.js";
import rulesController from "../controllers/rules.js";
import teetimesController from "../controllers/tee-times.js";

const router = express.Router();

router.get("/", homeController);
router.get("/course", courseController);
router.get("/results", resultsController);
router.get("/skins", skinsController);
router.get("/overall", overallController);
router.get("/rules", rulesController);
router.get("/tee-times", teetimesController);

router.get("/login", (req, res) => {
  res.render("login");
});

router.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    req.session.isAdmin = true;

    return res.redirect("/");
  }

  res.render("login", {
    error: "Invalid username or password",
  });
});

router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});

export default router;
