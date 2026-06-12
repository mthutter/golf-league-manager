import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { verifyAdminCredentials } from "../services/auth.service.js";

describe("Auth Service - verifyAdminCredentials()", () => {
  // Save original environment variables
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.ADMIN_USER = "commissioner1";
    process.env.ADMIN_PASS = "golfsecret123";
  });

  afterEach(() => {
    process.env = { ...originalEnv }; // Restore env back to normal
  });

  test("should return true for matching valid credentials", () => {
    const result = verifyAdminCredentials("commissioner1", "golfsecret123");
    assert.strictEqual(result, true);
  });

  test("should return false for invalid passwords", () => {
    const result = verifyAdminCredentials("commissioner1", "wrong_password");
    assert.strictEqual(result, false);
  });

  test("should return false if credentials are missing from the system environment", () => {
    delete process.env.ADMIN_USER;
    const result = verifyAdminCredentials("commissioner1", "golfsecret123");
    assert.strictEqual(result, false);
  });
});
