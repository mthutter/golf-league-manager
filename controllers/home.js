export default async (req, res) => {
  res.render("index");
  console.log(req.session.id);
};
