import * as scoresService from "../services/scores.service.js";

export const getNewScoresForm = async (req, res) => {
  try {
    const { members, holes } = await scoresService.getFormData();
    res.render("weekly-scores-form", { members, holes });
  } catch (err) {
    console.error("Error loading score form layout:", err);
    res.status(500).send("Database error");
  }
};

export const saveScore = async (req, res) => {
  try {
    await scoresService.createScoreRecord(req.body);
    res.redirect("/scores/new");
  } catch (err) {
    console.error("Error saving score payload:", err);
    if (err.message.includes("UNIQUE")) {
      return res
        .status(400)
        .send("Scores already entered for this player/week.");
    }
    res.status(500).send("Database error");
  }
};

export const getStandings = async (req, res) => {
  try {
    const data = await scoresService.getSeasonStandings();
    res.render("standings", data);
  } catch (err) {
    console.error("Error rendering season standings:", err);
    res.status(500).send("Database Error");
  }
};

export const getWeeklyScores = async (req, res) => {
  try {
    const weekId = req.params.weekId;
    const results = await scoresService.getWeeklyBreakdown(weekId);
    res.render("weekly", { weekId, results });
  } catch (err) {
    console.error("Error gathering weekly scores:", err);
    res.status(500).send("Database Error");
  }
};

export const getMemberProfile = async (req, res) => {
  try {
    const memberId = parseInt(req.params.id, 10);
    const profileData = await scoresService.getMemberProfileData(memberId);

    if (!profileData) {
      return res.status(404).send("Player Not Found");
    }

    res.render("profile", profileData);
  } catch (err) {
    console.error("Error populating member profile:", err);
    res.status(500).send("Database Error");
  }
};

// Legacy alias from your original imports
export const getScoresLegacy = async (req, res) => {
  // If you had a pre-existing getScores exported controller function, redirect or call it here
  res.redirect("/scores/standings");
};
