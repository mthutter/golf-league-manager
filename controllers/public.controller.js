import { getSeasonStandings } from "../services/scores.service.js";

export const course = async (req, res) => {
  res.render("course");
  console.log(req.session.id);
};

export const index = async (req, res) => {
  const { currentWeek, biggestUp, biggestDown } = await getSeasonStandings();

  res.render("index", {
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

export const tee_times = async (req, res) => {
  res.render("tee-times");
  console.table(req.sessionID);
};
