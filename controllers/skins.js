export default async (req, res) => {
  res.render("skins");
  console.log(req.session.id);
};
