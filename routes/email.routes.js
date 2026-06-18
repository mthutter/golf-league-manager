import express from "express";
import { renderEmailForm, sendBulkEmail } from "../controllers/email.controller.js";

const router = express.Router();

// Handled in browser via: http://localhost:3000/email/admin
router.get("/admin", renderEmailForm);

// Handled via AJAX fetch request
router.post("/admin/send", sendBulkEmail);

export default router;
