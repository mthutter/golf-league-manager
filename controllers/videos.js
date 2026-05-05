export default async (req, res) => {
  res.render("videos");
  console.log(req.session.id);
};
