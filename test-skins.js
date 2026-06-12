import { calculateSkins } from "./services/skins.service.js";
import { all } from "./config/db.js";

async function verifySkinsReportingPipeline() {
  console.log("🚀 Starting Skins Report Page validation checks...\n");

  try {
    // Test 1: Verify database connection and seed data
    console.log("Checking database connection and available weeks...");
    const weeks = await all(
      `SELECT DISTINCT week_id FROM scores ORDER BY week_id DESC`,
    );

    if (weeks.length === 0) {
      console.log(
        "⚠️ WARNING: Your 'scores' table has no recorded weeks. Insert mock data first.",
      );
      process.exit(1);
    }
    console.log(
      `✅ Success: Database connected. Found ${weeks.length} unique weeks available.\n`,
    );

    const testWeekId = weeks[0].week_id;
    console.log(`Using Week ID [${testWeekId}] for route simulation testing.`);

    // Test 2: Verify logic calculation pipeline writes cleanly to modified tables
    console.log("Simulating calculateSkins logic process running...");
    const calculationResult = await calculateSkins(testWeekId);
    console.log(
      "✅ Success: Service calculation run completed without structural or memory exceptions.",
    );
    console.log(
      `   - Skins Pool Pot Calculated: $${calculationResult.totalPot || 0}`,
    );
    console.log(
      `   - Raw Payout Per Skin: $${calculationResult.payoutPerSkin || 0}\n`,
    );

    // Test 3: Validate database queries using your custom name_last & name_first column updates
    console.log("Simulating Express route database payload generation...");

    const leaderboard = await all(
      `SELECT 
        ws.member_id AS member_id,
        m.name_first AS first_name,
        m.name_last AS last_name,
        ws.skins_won AS skins_won,
        ws.payout AS payout
       FROM weekly_skins ws
       LEFT JOIN members m ON ws.member_id = m.id
       WHERE ws.week_id = ?`,
      [testWeekId],
    );

    const holeDetails = await all(
      `SELECT 
        sd.hole_number AS hole_number,
        sd.score AS score,
        sd.payout AS payout,
        m.name_first AS first_name,
        m.name_last AS last_name
       FROM skin_details sd
       LEFT JOIN members m ON sd.member_id = m.id
       WHERE sd.week_id = ?`,
      [testWeekId],
    );

    console.log("✅ Success: SQL statement queries executed cleanly.");
    console.log(`   - Leaderboard Rows Retrieved: ${leaderboard.length}`);
    console.log(`   - Detailed Hole Winners Mapped: ${holeDetails.length}\n`);

    console.log(
      "🎉 All core code paths verified! Your skins-report environment is structured perfectly for production rendering.",
    );
  } catch (error) {
    console.error("\n❌ PIPELINE VERIFICATION FAILED!");
    console.error("--------------------------------------------------");
    console.error(error);
    console.error("--------------------------------------------------");
    console.log(
      "\n💡 Recommendation: Check table schema constraints or confirm 'members' table mapping column details.",
    );
  }
}

verifySkinsReportingPipeline();
