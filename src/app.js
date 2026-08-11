import express from "express";
import cors from "cors";

import webhookRoutes from "./routes/webhook.route.js";
import paymentRoutes from "./routes/payment.route.js";
import { notFound } from "./middlewares/notFound.js";
import { errorHandler } from "./middlewares/errorHandler.js";

const app = express();

app.disable("x-powered-by");

// ------------------------------------
// CORS
// ------------------------------------

app.use(
  cors({
    origin:
      process.env.CORS_ORIGIN ||
      "http://localhost:3000",
    credentials: true,
  })
);

// ------------------------------------
// Health check
// ------------------------------------

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "ok",
    service: "payment-api",
  });
});

// ------------------------------------
// Revolut webhook
//
// MUST come before express.json()
// ------------------------------------

app.use(
  "/api/webhooks",
  webhookRoutes
);

// ------------------------------------
// Normal JSON APIs
// ------------------------------------

app.use(
  express.json({
    limit: "1mb",
  })
);

// ------------------------------------
// Payment APIs
// ------------------------------------

app.use(
  "/api/payments",
  paymentRoutes
);

// ------------------------------------
// 404
// ------------------------------------

app.use(notFound);

// ------------------------------------
// Error handler
// ------------------------------------

app.use(errorHandler);

export default app;