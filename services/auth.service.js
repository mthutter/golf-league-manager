/**
 * Assesses whether credentials align with environment targets
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
