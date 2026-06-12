import { test, describe, mock } from "node:test";
import assert from "node:assert";

// 1. Mock out the database connection BEFORE importing the service
mock.module("../config/db.js", {
  namedExports: {
    // Simulate what the database would return to our engine
    all: async (sql, params) => {
      // If the engine asks for hole handicap indexes
      if (sql.includes("FROM holes")) {
        return [
          { hole_number: 1, handicap_men: 5 }, // Hole 1 difficulty is index 5
        ];
      }
      // If the engine asks for signed-up scorecards for Week 1
      if (sql.includes("FROM scores")) {
        return [
          {
            member_id: 101,
            name_first: "Tiger",
            name_last: "Woods",
            handicap_used: 0, // Scratch player
            gross1: 4, // Gross 4, Net 4
          },
          {
            member_id: 102,
            name_first: "Happy",
            name_last: "Gilmore",
            handicap_used: 0,
            gross1: 5, // Gross 5, Net 5
          },
        ];
      }
      return [];
    },
  },
});

// 2. Import the service now that its database dependency is safely mocked
import { calculateSkins } from "../services/skins.service.js";

describe("Skins Service Calculation Engine", () => {
  test("should correctly isolate an outright skin and distribute payouts", async () => {
    const results = await calculateSkins(1); // Calculate for Week 1

    // Tiger Woods (ID 101) had a Net 4 vs Happy Gilmore's Net 5. Tiger wins the skin!
    assert.ok(results.skinTotals["101"], "Player 101 should have won a skin");
    assert.strictEqual(
      results.skinTotals["101"].count,
      1,
      "Player 101 total skins should be 1",
    );
    assert.deepStrictEqual(
      results.skinTotals["101"].holes,
      [1],
      "The skin should be won on Hole 1",
    );

    // Financial math checks ($5 buy-in * 2 players = $10 total pot. 1 skin gets the full $10 pot)
    assert.strictEqual(results.totalPot, 10, "Total pot should equal $10");
    assert.strictEqual(
      results.payoutPerSkin,
      10,
      "Payout per skin should equal $10",
    );

    // Happy Gilmore (ID 102) tied nothing and won nothing
    assert.strictEqual(
      results.skinTotals["102"],
      undefined,
      "Player 102 should not be listed as a winner",
    );
  });
});
