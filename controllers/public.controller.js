import { getSeasonStandings } from "../services/scores.service.js";
import { getGroupingsForWeek } from "../services/grouping.service.js";

export const course = async (req, res) => {
  res.render("course");
  console.log(req.session.id);
};

export const index = async (req, res) => {
  const { currentWeek, biggestUp, biggestDown } = await getSeasonStandings();

  res.render("index", {
    metaDescription: "Bottoms Up Golf League in Colorado Springs. Standings, tee times, scores, photos, and league information.",
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

export const showTeeTimes = async (req, res) => {
  try {
    // 1. Force fallbacks so it safely falls back to Week 1 if query is empty
    const weekId = Number(req.query.week) || 1;

    // 2. Safely call the updated SQLite service wrapper
    const { groupings, outPlayers } = await getGroupingsForWeek(weekId);
    const weeks = Array.from({ length: 22 }, (_, i) => ({ id: i + 1 }));
    // 3. EXPLICITLY send variables to EJS to eliminate the ReferenceError
    res.render("tee-times", {
      groupings: groupings || [],
      outPlayers: outPlayers || [],
      weekId: weekId, // <-- This natively fixes your line 48 crash!
      weeks: weeks,
    });
  } catch (err) {
    console.error("Error loading tee times view:", err);
    res.status(500).send("Unable to load tee times.");
  }
};
