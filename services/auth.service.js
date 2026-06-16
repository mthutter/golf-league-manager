/**
 * Assesses whether credentials align with environment targets for Admin access
 */
export function verifyAdminCredentials(username, password) {
  const adminUser = process.env.ADMIN_USER;
  const adminPass = process.env.ADMIN_PASS;

  if (!adminUser || !adminPass) {
    console.warn(
      "WARNING: ADMIN_USER or ADMIN_PASS environment variables are missing!",
    );
    return false;
  }

  return username === adminUser && password === adminPass;
}

/**
 * Assesses whether credentials align with environment targets for standard League Members
 */
export function verifyUserCredentials(username, password) {
  const leagueUser = process.env.LEAGUE_USER;
  const leaguePass = process.env.LEAGUE_PASS;

  if (!leagueUser || !leaguePass) {
    console.warn(
      "WARNING: LEAGUE_USER or LEAGUE_PASS environment variables are missing! Falling back to false.",
    );
    return false;
  }

  return username === leagueUser && password === leaguePass;
}
