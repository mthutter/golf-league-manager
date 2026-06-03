import * as playersService from "../services/players.service.js";

/**
 * GET /players - Display active players
 */
export async function getPlayers(req, res) {
  try {
    const rows = await playersService.getAllPlayers();
    res.render("players", { players: rows });
  } catch (err) {
    console.error("Database Error:", err.message);
    res.status(500).render("error", { message: "Unable to retrieve players." });
  }
}

/**
 * GET /players/inactive - Display inactive players
 */
export async function getPlayersInactive(req, res) {
  try {
    const rows = await playersService.getAllPlayers();
    res.render("inactive", { players: rows });
  } catch (err) {
    console.error("Database Error:", err.message);
    res.status(500).render("error", { message: "Unable to retrieve players." });
  }
}

/**
 * GET /players/new - Show creation form
 */
export function showAddPlayerForm(req, res) {
  res.render("add-player-form");
}

/**
 * POST /players - Create player record
 */
export async function createPlayer(req, res) {
  const { name_first, name_last } = req.body;

  // Basic Validation stays in controller to prevent hitting the DB unnecessarily
  if (!name_first || !name_last) {
    return res.status(400).render("error", {
      message: "First and last name are required.",
    });
  }

  try {
    const lastID = await playersService.createNewPlayer(req.body);
    console.log(`Player created with ID ${lastID}`);
    res.redirect("/players");
  } catch (err) {
    console.error("Insert Error:", err.message);
    res.status(500).render("error", { message: "Unable to create player." });
  }
}
