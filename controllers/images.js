export default async (req, res) => {
  res.render("images", { items: imageFiles2024 });
  console.log(req.session.id);
};
