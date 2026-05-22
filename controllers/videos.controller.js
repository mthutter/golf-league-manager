import { getFilenames } from "../services/ftp.service.js";

export async function videosByYear(req, res) {
  try {
    const { year } = req.params;
    const filenames = await getFilenames(year);

    res.render("videos", {
      year,
      filenames,
    });
  } catch (err) {
    console.error(err);

    res.status(500).render("error", {
      message: "Unable to load videos.",
    });
  }
}
