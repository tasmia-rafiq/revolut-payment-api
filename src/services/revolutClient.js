import crypto from "crypto";

const REVOLUT_API_BASE_URL =
  process.env.REVOLUT_API_BASE_URL || "https://merchant.revolut.com/api";

const REVOLUT_API_VERSION = process.env.REVOLUT_API_VERSION || "2026-08-02";

const REVOLUT_SECRET_API_KEY = process.env.REVOLUT_SECRET_API_KEY;

/**
 * Generate an idempotency key when the caller does not
 * provide one.
 *
 * IMPORTANT:
 * For operations that may be retried by the caller,
 * the controller should provide a stable key instead
 * of relying on this fallback.
 */
const generateIdempotencyKey = () => {
  return crypto.randomUUID();
};

/**
 * Build common Merchant API headers.
 */
const buildHeaders = (idempotencyKey) => {
  const headers = {
    Authorization: `Bearer ${REVOLUT_SECRET_API_KEY}`,
    "Revolut-Api-Version": REVOLUT_API_VERSION,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  return headers;
};

/**
 * Convert a failed Revolut response into a consistent
 * application error.
 */
const createRevolutError = async (response) => {
  let details;

  try {
    details = await response.json();
  } catch {
    details = null;
  }

  const error = new Error(
    details?.message ||
      details?.error ||
      `Revolut API request failed with status ${response.status}`,
  );

  error.name = "RevolutApiError";
  error.isRevolutError = true;
  error.statusCode = response.status;
  error.code = details?.code || details?.error_code || "REVOLUT_API_ERROR";
  error.details = details;

  return error;
};

/**
 * Make an authenticated request to Revolut Merchant API.
 */
const request = async (path, { method = "GET", body, idempotencyKey } = {}) => {
  if (!REVOLUT_SECRET_API_KEY) {
    const error = new Error("Revolut API key is not configured");

    error.name = "RevolutConfigurationError";
    error.isRevolutError = true;
    error.statusCode = 500;

    throw error;
  }

  const response = await fetch(`${REVOLUT_API_BASE_URL}${path}`, {
    method,
    headers: buildHeaders(idempotencyKey),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw await createRevolutError(response);
  }

  // Some successful endpoints can return an empty body.
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json();
};

/**
 * Create a payment order in Revolut.
 *
 * Revolut endpoint:
 * POST /orders
 *
 * The request body follows the design document:
 *
 * {
 *   amount,
 *   currency,
 *   description,
 *   customer,
 *   merchant_order_data,
 *   redirect_url
 * }
 */
const createOrder = async (
  {
    amount,
    currency,
    description,
    customer,
    merchant_order_data,
    redirect_url,
  },
  options = {},
) => {
  const idempotencyKey = options.idempotencyKey || generateIdempotencyKey();

  return request("/orders", {
    method: "POST",

    idempotencyKey,

    body: {
      amount,
      currency,
      ...(description !== undefined && {
        description,
      }),
      ...(customer !== undefined && {
        customer,
      }),
      merchant_order_data,
      ...(redirect_url !== undefined && {
        redirect_url,
      }),
    },
  });
};

/**
 * Capture a Revolut order.
 *
 * This is kept separate from createOrder because
 * capturing an order is a different Revolut operation.
 */
const captureOrder = async (revolutOrderId, options = {}) => {
  if (!revolutOrderId) {
    const error = new Error("Revolut order ID is required");

    error.name = "RevolutValidationError";
    error.isRevolutError = false;

    throw error;
  }

  const idempotencyKey = options.idempotencyKey || generateIdempotencyKey();

  return request(`/orders/${encodeURIComponent(revolutOrderId)}/capture`, {
    method: "POST",
    idempotencyKey,
  });
};

/**
 * Create a full or partial refund.
 *
 * Revolut endpoint:
 * POST /orders/{order_id}/refund
 *
 * The design document specifies:
 *
 * {
 *   amount,
 *   currency
 * }
 */
const refund = async (revolutOrderId, { amount, currency }, options = {}) => {
  if (!revolutOrderId) {
    const error = new Error("Revolut order ID is required");

    error.name = "RevolutValidationError";
    error.isRevolutError = false;

    throw error;
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    const error = new Error("Refund amount must be a positive integer");

    error.name = "RevolutValidationError";
    error.isRevolutError = false;

    throw error;
  }

  if (!currency) {
    const error = new Error("Refund currency is required");

    error.name = "RevolutValidationError";
    error.isRevolutError = false;

    throw error;
  }

  const idempotencyKey = options.idempotencyKey || generateIdempotencyKey();

  return request(`/orders/${encodeURIComponent(revolutOrderId)}/refund`, {
    method: "POST",
    idempotencyKey,
    body: {
      amount,
      currency,
    },
  });
};

const revolutClient = {
  createOrder,
  captureOrder,
  refund,
};

export default revolutClient;
