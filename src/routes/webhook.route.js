import express, { Router } from "express";

import { handleRevolutWebhook } from "../controllers/webhook.controller.js";
import { verifyRevolutWebhook } from "../middleware/revolutWebhook.middleware.js";

const router = Router();

router.post(
  "/revolut",
  express.raw({ type: "application/json" }),
  verifyRevolutWebhook,
  handleRevolutWebhook
);

export default router;