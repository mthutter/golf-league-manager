import express from "express";
import * as activationController from "../controllers/activation.controller.js";

const router = express.Router();

router.get("/", activationController.showActivationPage);
router.post("/", activationController.activateAccount);

router.get("/request", activationController.showActivationRequestPage);
router.post("/request", activationController.handleActivationRequest);

router.get("/forgot-password", activationController.showForgotPasswordPage);
router.post("/forgot-password", activationController.handleForgotPassword);

router.get("/reset-password", activationController.showResetPasswordPage);
router.post("/reset-password", activationController.handleResetPassword);

export default router;