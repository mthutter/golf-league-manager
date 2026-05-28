export function showWeeklyScoresForm(req, res) {
  res.render("weekly-scores-form");
}

export function postWeeklyScore(req, res) {
  const {
    name_last,
    name_first,
    phone,
    handicap,
    password,
    e_mail,
    year_joined,
    status,
    type,
  } = req.body;

  /* =========================================
     VALIDATION
  ========================================= */

  if (!name_first || !name_last) {
    return res.status(400).render("error", {
      message: "First and last name are required.",
    });
  }

  /* =========================================
     INSERT PLAYER
  ========================================= */

  const sql = `
    INSERT INTO members (
      name_last,
      name_first,
      phone,
      handicap,
      password,
      e_mail,
      year_joined,
      status,
      type
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    name_last,
    name_first,
    phone,
    handicap,
    password,
    e_mail,
    year_joined,
    status,
    type,
  ];

  db.run(sql, values, function (err) {
    if (err) {
      console.error("Insert Error:", err.message);

      return res.status(500).render("error", {
        message: "Unable to create player.",
      });
    }

    console.log(`Player created with ID ${this.lastID}`);

    res.redirect("/scores");
  });
}
