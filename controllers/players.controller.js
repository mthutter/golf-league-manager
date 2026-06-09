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

/* ==========================================================================
   NEW WORK: EDIT AND UPDATE LOGIC
   ========================================================================== */

/**
 * GET /players/:id/edit - Show modify player form
 */
export async function showEditPlayerForm(req, res) {
  const playerId = req.params.id;
  try {
    // Fetches individual player record from service layer
    const player = await playersService.getPlayerById(playerId);

    if (!player) {
      return res.status(404).render("error", { message: "Player not found." });
    }

    // Renders the modify-player.ejs view you just built
    res.render("modify-player", { player: player });
  } catch (err) {
    console.error("Fetch Player Error:", err.message);
    res
      .status(500)
      .render("error", { message: "Unable to load player details." });
  }
}

/**
 * POST /players/:id - Update player record
 */
export async function updatePlayer(req, res) {
  const playerId = req.params.id;
  const { name_first, name_last } = req.body;

  // Basic validation match to createPlayer action logic
  if (!name_first || !name_last) {
    return res.status(400).render("error", {
      message: "First and last name are required.",
    });
  }

  try {
    // Sends structural payload object along with targeting ID
    await playersService.updatePlayerById(playerId, req.body);
    console.log(`Player ID ${playerId} updated successfully.`);
    res.redirect("/players");
  } catch (err) {
    console.error("Update Error:", err.message);
    res.status(500).render("error", { message: "Unable to update player." });
  }
}
