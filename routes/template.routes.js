import { Router } from "express";
// 1. Import your matching controllers 
import {
  getAllItems,
  getItemById,
  createNewItem,
  updateItemApi
} from "../controllers/template.controller.js";

// 2. Import your authorization security filters
import authMiddleware from "../middleware/auth.middleware.js"; 

const router = Router();

/**
 * =========================================================================
 * PUBLIC WEB ROUTES (No authentication required)
 * =========================================================================
 */

// GET /items - Public view of all entries
router.get("/items", getAllItems);

// GET /items/:id - Public individual item profile lookup
router.get("/items/:id", getItemById);


/**
 * =========================================================================
 * PROTECTED WEB ROUTES (Requires League Member or Admin authentication)
 * =========================================================================
 */

// POST /items - Creates a record (Protected by your application's auth checks)
router.post("/items", authMiddleware, createNewItem);


/**
 * =========================================================================
 * ADMIN API ENDPOINTS (Strictly requires elevated privileges)
 * =========================================================================
 */

// PUT /api/items/:id - Administrative profile update logic
// Note: If you have a specific admin middleware filter, chain it here
router.put("/api/items/:id", authMiddleware, updateItemApi);

export default router;
