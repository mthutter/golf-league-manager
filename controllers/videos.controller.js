import { getVideos } from "../services/videos.service.js";

export async function videosByYear(req, res) {
  try {
    const { year } = req.params;

    const videos = await getVideos(year);

    res.render("videos", {
      year,
      videos,
    });
  } catch (err) {
    console.error(err);

    res.status(500).render("error", {
      message: "Unable to load videos.",
    });
  }
}
