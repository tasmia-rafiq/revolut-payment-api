import "dotenv/config";

const requiredEnv = [
  "MONGODB_URI",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(
      `Missing required environment variable: ${key}`
    );
  }
}

export const env = {
  nodeEnv:
    process.env.NODE_ENV || "development",

  port:
    Number(process.env.PORT) || 5000,

  mongodbUri:
    process.env.MONGODB_URI,

  revolutApiKey:
    process.env.REVOLUT_SECRET_API_KEY,

  revolutApiBaseUrl:
    process.env.REVOLUT_API_BASE_URL ||
    "https://merchant.revolut.com/api",

  revolutApiVersion:
    process.env.REVOLUT_API_VERSION ||
    "2026-08-02",

  revolutWebhookSigningSecrets:
    (
      process.env.REVOLUT_WEBHOOK_SIGNING_SECRET ||
      ""
    )
      .split(",")
      .map((secret) => secret.trim())
      .filter(Boolean),

  corsOrigin:
    process.env.CORS_ORIGIN ||
    "http://localhost:3000",
};