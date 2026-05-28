export default async (req, res) => {
  res.render("results");
  console.log(req.session.id);
};
