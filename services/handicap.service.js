import { all, run } from "../config/db.js";

export async function calculateHandicaps(coursePar = 36) {
  const players = await all(`
    SELECT
      id,
      name_last,
      handicap
    FROM members
  `);

  for (const player of players) {
    const rounds = await all(
      `
      SELECT
        gross1 + gross2 + gross3 +
        gross4 + gross5 + gross6 +
        gross7 + gross8 + gross9 AS total_score
      FROM scores
      WHERE member_id = ?
      `,
      [player.id],
    );

    // Skip players with no rounds entered
    if (rounds.length === 0) {
      continue;
    }

    // New players (no carry-over handicap) need 3 rounds
    const isNewPlayer = player.handicap == null;

    if (isNewPlayer && rounds.length < 3) {
      continue;
    }

    const total = rounds.reduce((sum, r) => sum + r.total_score, 0);

    const average = total / rounds.length;
    const handicap = Math.round(average - coursePar);

    console.log(`${player.name_last}: avg=${average.toFixed(2)} hcp=${handicap} rnds=${rounds.length}`);

    await run(
      `
      UPDATE members
      SET current_handicap = ?
      WHERE id = ?
      `,
      [handicap, player.id],
    );

    await run(
      `
      UPDATE members
      SET average_score = ?
      WHERE id = ?
      `,
      [average, player.id],
    );

    await run(
      `
      UPDATE members
      SET rounds_played = ?
      WHERE id = ?
      `,
      [rounds.length, player.id],
    );
  }
}
