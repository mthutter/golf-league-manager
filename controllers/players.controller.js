import * as playersService from "../services/players.service.js";
import logger from "../utilities/logger.js";
import {
    catchAsync
} from "../utilities/asyncHandler.js";
import posthog from "../utilities/posthog.js";
import * as accountService from "../services/account.service.js";
import {
    ROLES
} from "../services/roles.service.js";

/**
 * GET /players - Display active players
 */
export const getPlayers = catchAsync(async (req, res, next) => {
    logger.info("Retrieving active league roster directory");
    const rows = await playersService.getAllPlayers();
    return res.render("players", {
        players: rows
    });
});

/**
 * GET /players/inactive - Display inactive players
 */
export const getPlayersInactive = catchAsync(async (req, res, next) => {
    logger.info("Retrieving inactive league roster directory");

    // FIX: If you have an explicit service method like 'getInactivePlayers', swap it here.
    // Otherwise, filter the full roster array reactively to separate status properties.
    const allRows = await playersService.getAllPlayers();
    const inactiveRows = allRows.filter((player) => player.status === "No" || player.is_active === 0);

    return res.render("inactive", {
        players: inactiveRows
    });
});

/**
 * GET /players/new - Show creation form
 */
export const showAddPlayerForm = (req, res) => {
    return res.render("add-player-form");
};

/**
 * POST /players - Create player record
 */
export const createPlayer = catchAsync(async (req, res, next) => {
    const {
        name_first,
        name_last
    } = req.body;

    if (!name_first || !name_last) {
        logger.warn("Player registration rejected: Missing name identity fields");
        res.status(400);
        return res.render("error", {
            message: "First and last name are required.",
        });
    }

    const roles = Array.isArray(req.body.roles) ? req.body.roles : req.body.roles ? [req.body.roles] : [ROLES.MEMBER];

    const lastID = await playersService.createNewPlayer(req.body);

    await accountService.initializeAccount(lastID, {
        roles,
        sendActivationEmail: req.body.sendActivationEmail === "on",
        email: req.body.e_mail,
        firstName: req.body.name_first,
    });

    logger.info({
            playerId: lastID,
            name: `${name_first} ${name_last}`,
            roles,
            activationEmail: req.body.sendActivationEmail === "on",
        },
        "New league player account created",
    );

    posthog.capture({
        distinctId: req.session?.id || "anonymous",
        event: "player_created",
        properties: {
            player_id: lastID,
            roles,
            activation_email: req.body.sendActivationEmail === "on",
        },
    });

    return res.redirect("/players");
});

/**
 * GET /players/:id/edit - Show modification form with existing player data
 */
export const showEditPlayerForm = catchAsync(async (req, res, next) => {
    const playerId = req.params.id;
    const player = await playersService.getPlayerById(playerId);

    if (!player) {
        logger.warn({
            playerId
        }, "Requested player modifier form target record not found");
        res.status(404);
        return res.render("error", {
            message: "Player not found."
        });
    }

    // FIX: Explicitly fetch the database role strings array and bind it to the object
    // For id: 12, this will assign player.roles = ['Admin', 'Member']
    player.roles = await playersService.getPlayerRoles(playerId);

    return res.render("modify-player", {
        player: player
    });
});

/**
 * POST /players/:id - Update existing player record
 */
/**
 * POST /players/:id - Update existing player record
 */
export const updatePlayer = catchAsync(async (req, res, next) => {
    const playerId = req.params.id;
    const {
        name_first,
        name_last
    } = req.body;

    if (!name_first || !name_last) {
        logger.warn({
            playerId
        }, "Player profile update rejected: Missing identity parameters");
        res.status(400);
        return res.render("error", {
            message: "First and last name are required."
        });
    }

    // 1. EXTRACT ROLES: Capture the checkbox states safely into an array
    const roles = Array.isArray(req.body.roles) ? req.body.roles : req.body.roles ? [req.body.roles] : []; // If empty, defaults to an empty array so all roles get removed

    // 2. UPDATE BASE DETAILS: Keeps your current logic updating the 'members' table
    await playersService.updatePlayerById(playerId, req.body);

    // 3. SYNC ROLES IN SQLITE: Wipes out old rows for this player and re-inserts current checkbox values
    if (playersService.syncPlayerRoles) {
        await playersService.syncPlayerRoles(playerId, roles);
    }

    logger.info("League player profile details and roles updated successfully");

    posthog.capture({
        distinctId: req.session?.id || "anonymous",
        event: "player_updated",
        properties: {
            player_id: playerId,
            roles
        },
    });

    return res.redirect("/players");
});