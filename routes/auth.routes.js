import express from "express";

const router = express.Router();

/* =========================================
   LOGIN PAGE
========================================= */

router.get("/login", (req, res) => {
  res.render("login");
});

/* =========================================
   LOGIN ACTION
========================================= */

router.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  ) {
    req.session.isAdmin = true;

    return res.redirect("/");
  }

  res.render("login", {
    error: "Invalid username or password",
  });
});

/* =========================================
   LOGOUT
========================================= */

router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.redirect("/");
    }

    res.clearCookie("connect.sid");

    res.redirect("/");
  });
});

export default router;
