export default async (req, res) => {
  res.render("add-player-form");
  console.log(req.session.id);
};
