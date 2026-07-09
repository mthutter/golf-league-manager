import { getFilenames } from "../services/ftp.service.js";

export async function imagesByYear(req, res) {
  try {
    const { year } = req.params;
    const filenames = await getFilenames(year);

    res.render("images", { year, filenames });
  } catch (err) {
    logger.erroror(err);

    res.status(500).render("error", { message: "Unable to load images." });
  }
}
