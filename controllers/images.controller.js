import { getFilenames } from "../services/ftp.service.js";

export async function imagesByYear(req, res) {
  try {
    const { year } = req.params;

    const filenames = await getFilenames(year);

    res.render("images", {
      year,
      filenames,
    });
  } catch (err) {
    console.error(err);

    res.status(500).render("error", {
      message: "Unable to load images.",
    });
  }
}
