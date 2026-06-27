import { getSeasonStandings } from "../services/scores.service.js";
import { getGroupingsForWeek } from "../services/grouping.service.js";

export const course = async (req, res) => {
  res.render("course");
  console.log(req.session.id);
};

export const index = async (req, res) => {
  const { currentWeek, biggestUp, biggestDown } = await getSeasonStandings();

  res.render("index", {
    metaDescription:
      "Bottoms Up Golf League in Colorado Springs. Standings, tee times, scores, photos, and league information.",
    currentWeek,
    biggestUp,
    biggestDown,
  });

  console.log(req.session.id);
};

export const rules = async (req, res) => {
  res.render("rules");
  console.log(req.session.id);
};
