import { all, run } from "../config/db.js";
import { SKINS_BUY_IN } from "../config/league.js";

export async function calculateSkins(weekId) {
  // remove previous calculations
  await run(
    `DELETE FROM weekly_skins
     WHERE week_id = ?`,
    [weekId],
  );

  const scorecards = await all(
    `
    SELECT *
    FROM scores
    WHERE week_id = ?
      AND skins_entered = 1
    `,
    [weekId],
  );

  if (scorecards.length === 0) {
    return;
  }

  const skinTotals = {};

  // holes 1-9
  for (let hole = 1; hole <= 9; hole++) {
    const scores = scorecards
      .map((player) => ({
        memberId: player.member_id,
        score: player[`gross${hole}`],
      }))
      .filter((x) => x.score > 0);

    if (scores.length === 0) continue;

    const lowScore = Math.min(...scores.map((s) => s.score));

    const winners = scores.filter((s) => s.score === lowScore);

    // tie = no skin
    if (winners.length !== 1) continue;

    const winnerId = winners[0].memberId;

    skinTotals[winnerId] = (skinTotals[winnerId] || 0) + 1;
  }

  // save results
  for (const [memberId, skinsWon] of Object.entries(skinTotals)) {
    await run(
      `
      INSERT INTO weekly_skins (
        week_id,
        member_id,
        skins_won,
        payout
      )
      VALUES (?, ?, ?, 0)
      `,
      [weekId, memberId, skinsWon],
    );
  }

  return skinTotals;
}
