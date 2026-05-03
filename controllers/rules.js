export default async (req, res) => {
  res.render("rules");
  console.log(req.session.id);
};
