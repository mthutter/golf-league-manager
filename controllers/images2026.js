export default async (req, res) => {
  res.render("images2026", { items: imageFiles2026 });
  console.log(req.session.id);
};
