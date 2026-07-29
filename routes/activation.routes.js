import express from "express";
import * as activationController from "../controllers/activation.controller.js";
import { act } from "react";

const router = express.Router();

router.get("/", activationController.showActivationPage);
router.post("/", activationController.activateAccount);

router.get("/request", activationController.showActivationRequestPage);

router.post("/request", activationController.handleActivationRequest);

export default router;
