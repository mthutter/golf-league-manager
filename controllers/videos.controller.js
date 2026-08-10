import { getVideos } from "../services/videos.service.js"; 
import logger from "../utilities/logger.js"; // Added the missing logger import
import { catchAsync } from "../utilities/asyncHandler.js"; // Import your wrapper utility

/**
 * GET /videos/:year
 * Retrieves video assets from storage and renders the view
 */
export const videosByYear = catchAsync(async (req, res, next) => {
  const { year } = req.params;

  logger.info("Fetching video asset records from the database directory index");
  
  // Call service to pull video entries for the targeted year
  const videos = await getVideos(year); 

  logger.info("Video asset records index retrieved successfully");

  return res.render("videos", { year, videos }); 
});
