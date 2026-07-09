// 1. ALWAYS import services, your Pino logger, and the catchAsync utility at the top
import * as templateService from "../services/template.service.js"; 
import logger from "../utilities/logger.js"; 
import { catchAsync } from "../utilities/asyncHandler.js"; 

/**
 * GET /items
 * Renders an EJS list view (Standard page lookup)
 */
export const getAllItems = catchAsync(async (req, res, next) => {
  // Always log the action, passing context metadata as the FIRST argument object
  logger.info({ sessionId: req.session?.id }, "Fetching application items catalog");

  const items = await templateService.getItems();

  // Rule: Always use the 'return' keyword to halt execution after sending a response
  return res.render("items-index", { items });
});

/**
 * GET /items/:id
 * Renders a single resource profile or returns a 404 page
 */
export const getItemById = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  logger.info({ itemId: id }, "Retrieving resource profile details");

  const item = await templateService.findItem(id);

  // Check if resource exists before doing anything else
  if (!item) {
    logger.warn({ itemId: id }, "Resource lookup target record does not exist");
    res.status(404);
    return res.render("404"); // Safely drops into your 404 EJS layout
  }

  return res.render("items-show", { item });
});

/**
 * POST /items
 * Handles standard multi-part or encoded text HTML form data submissions
 */
export const createNewItem = catchAsync(async (req, res, next) => {
  const { name, value } = req.body;

  // Perform parameter validations inside the handler
  if (!name || !value) {
    logger.warn("Payload submission rejected: Missing required form fields");
    return res.status(400).send("Both name and value are strictly required fields.");
  }

  logger.info({ name }, "Initiating transaction sequence to insert new item record");
  const newItemId = await templateService.insertItem({ name, value });

  logger.info({ itemId: newItemId }, "New data entity index generated successfully");
  return res.redirect("/items");
});

/**
 * POST /api/items or PUT /api/items (API Endpoint Pattern)
 * Example endpoint layout returning clean structured JSON responses instead of views
 */
export const updateItemApi = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  
  logger.info({ itemId: id }, "Executing partial API profile modification update");
  
  const updatedData = await templateService.updateItem(id, req.body);
  
  // Return clean JSON instead of rendering an EJS template
  return res.status(200).json({
    success: true,
    data: updatedData
  });
});
