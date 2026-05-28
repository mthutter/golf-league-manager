export default function errorHandler(err, req, res, next) {
  console.error(err);

  res.status(500).render("error", {
    message: "Something went wrong.",
  });
}
