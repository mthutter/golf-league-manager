import express from "express";
import * as blogController from "../controllers/blog.controller.js";

const router = express.Router();

// GET routes for rendering views
router.get("/", blogController.renderIndex);
router.get("/new", blogController.renderNewForm);
router.get("/:slug", blogController.renderPost);

// POST route for handling form submission
router.post("/", blogController.createPost);

export default router;
