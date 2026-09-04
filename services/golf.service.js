// services/golf.service.js

/**
 * Calculates the gross, handicap strokes received, and net score
 * for a single hole.
 *
 * @param {number} gross - Gross strokes on the hole
 * @param {number} handicapUsed - Player's 9-hole handicap
 * @param {number} holeHandicap - Stroke index (1-18)
 * @returns {{gross:number, strokes:number, net:number}}
 */
export function calculateHoleScore(gross, handicapUsed, holeHandicap) {
  if (!gross || gross <= 0) {
    return {
      gross: 0,
      strokes: 0,
      net: 0,
    };
  }

  const nineHoleHandicap = Math.max(0, Number(handicapUsed) || 0);
  const holeStrokeIndex = ((Number(holeHandicap) - 1) % 9) + 1;
  const baseStrokes = Math.floor(nineHoleHandicap / 9);
  const remainingStrokes = nineHoleHandicap % 9;
  const strokes = baseStrokes + (holeStrokeIndex <= remainingStrokes ? 1 : 0);

  return {
    gross,
    strokes,
    net: gross - strokes,
  };
}

export function stablefordPoints(net, par) {
  const diff = net - par;

  if (diff >= 2) return 0;
  if (diff === 1) return 1;
  if (diff === 0) return 2;
  if (diff === -1) return 3;
  if (diff === -2) return 4;

  return 5;
}

/**
 * Builds a complete scorecard for either the front or back nine.
 *
 * @param {Object} player - Score record joined with member data
 * @param {Map} courseMap - Map keyed by hole_number
 * @param {number} startHole - 1 or 10
 * @returns {Array}
 */

/**
 * Builds a complete scorecard for either the front or back nine.
 *
 * @param {Object} player - Score record joined with member data
 * @param {Array} course - Course hole data
 * @param {number} startHole - 1 or 10
 * @returns {Array}
 */

export function buildHoleScores(player, course, startHole) {
  const holes = [];
  const sex = (player.sex || "M").toUpperCase();

  const courseMap = new Map(course.map((hole) => [hole.hole_number, hole]));

  for (let holeNumber = startHole; holeNumber < startHole + 9; holeNumber++) {
    const courseHole = courseMap.get(holeNumber);

    if (!courseHole) continue;

    const gross = player[`gross${holeNumber}`] || 0;

    const holeHandicap =
      sex === "F" ? courseHole.handicap_women : courseHole.handicap_men;

    const score = calculateHoleScore(gross, player.handicap_used, holeHandicap);

    const par = sex === "F" ? courseHole.par_women : courseHole.par_men;

    const yardage =
      sex === "F" ? courseHole.yardage_women : courseHole.yardage_men;

    const points = score.gross > 0 ? stablefordPoints(score.net, par) : 0;

    const delta = score.gross - par;

    let result = "";

    if (score.gross > 0) {
      switch (true) {
        case delta <= -2:
          result = "eagle";
          break;

        case delta === -1:
          result = "birdie";
          break;

        case delta === 0:
          result = "par";
          break;

        case delta === 1:
          result = "bogey";
          break;

        default:
          result = "double-plus";
      }
    }

    holes.push({
      holeNumber,
      yardage,
      par,
      handicap: holeHandicap,
      gross: score.gross,
      strokes: score.strokes,
      net: score.net,
      points,
      result,
    });
  }

  return holes;
}
