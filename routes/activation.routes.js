import express from "express";
import * as activationController from "../controllers/activation.controller.js";

const router = express.Router();

router.get("/", activationController.showActivationPage);
router.post("/", activationController.activateAccount);

export default router;
