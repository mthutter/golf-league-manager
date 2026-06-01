// scripts/calculateHandicaps.js

import { calculateHandicaps } from "./services/handicap.service.js";

try {
  await calculateHandicaps();
  console.log("Handicaps updated.");
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
