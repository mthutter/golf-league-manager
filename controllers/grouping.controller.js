import {
  getGroupingsForWeek,
  generateRandomGroupings,
} from "../services/groupings.service.js";

export const showTeeTimes = async (req, res) => {
  try {
    const weekId = Number(req.query.week) || 1;

    const groupings = await getGroupingsForWeek(weekId);

    res.render("tee-times", {
      groupings,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Unable to load tee times.");
  }
};

export const generateGroupings = async (req, res) => {
  try {
    const weekId = Number(req.params.weekId);

    await generateRandomGroupings(weekId);

    res.redirect(`/tee-times?week=${weekId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Unable to generate groupings.");
  }
};
