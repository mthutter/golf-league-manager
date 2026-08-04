// blog.routes.js
import express from "express";
import * as blogController from "../controllers/blog.controller.js"; // Adjust path to your controller
import { requireAuth, requireAdmin, requireMember } from "../middleware/auth.middleware.js";

const router = express.Router();

/* ========================================= READ BLOG (Players & Admins) ========================================= */

router.get("/", requireAuth, blogController.renderIndex);

/* ========================================= WRITE BLOG (Admin ONLY) ========================================= */

router.use(requireAuth);
router.use(requireAdmin);

router.get("/new", blogController.renderNewForm);
router.post("/", blogController.createPost);
router.post("/:id/delete", blogController.deletePost);
router.get("/:slug", blogController.renderPost);

export default router;
