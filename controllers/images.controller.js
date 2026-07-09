import { getFilenames } from "../services/ftp.service.js"; 
import logger from "../utilities/logger.js"; // Added the missing logger import
import { catchAsync } from "../utilities/asyncHandler.js"; // Import your wrapper utility

/**
 * GET /images/:year
 * Retrieves image filenames from storage and renders the library view
 */
export const imagesByYear = catchAsync(async (req, res, next) => {
  const { year } = req.params;

  logger.info({ year }, "Initiating connection to remote storage to fetch image directory index");
  
  // Call FTP service to scan the target remote subdirectory asset files
  const filenames = await getFilenames(year); 

  logger.info({ year, imageCount: filenames.length }, "Image registry index retrieved successfully");

  return res.render("images", { year, filenames }); 
});
