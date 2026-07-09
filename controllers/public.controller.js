import { getSeasonStandings } from "../services/scores.service.js"; 
import { getGroupingsForWeek } from "../services/grouping.service.js"; 
import logger from "../utilities/logger.js"; 
import { catchAsync } from "../utilities/asyncHandler.js"; 

/**
 * GET /course
 */
export const course = catchAsync(async (req, res, next) => {
  logger.info({ sessionId: req.session?.id }, "Course page viewed");
  return res.render("course");
});

/**
 * GET /
 */
export const index = catchAsync(async (req, res, next) => {
  // OPTIMIZATION: Fallback to an empty object if the database is initially unpopulated during boot
  const { currentWeek = 1, biggestUp = "-", biggestDown = "-" } = (await getSeasonStandings()) || {}; 
  
  logger.info({ sessionId: req.session?.id, currentWeek }, "Index page viewed");
  
  return res.render("index", { 
    metaDescription: "Bottoms Up Golf League in Colorado Springs. Standings, tee times, scores, photos, and league information.", 
    currentWeek, 
    biggestUp, 
    biggestDown, 
  });
});

/**
 * GET /rules
 */
export const rules = catchAsync(async (req, res, next) => {
  logger.info({ sessionId: req.session?.id }, "Rules page viewed");
  return res.render("rules");
});
