import crypto from "crypto";

const SIGNATURE_VERSION = "v1";
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

export const verifyRevolutWebhook = (req, res, next) => {
  try {
    const signatureHeader = req.get("Revolut-Signature");
    const timestamp = req.get("Revolut-Request-Timestamp");

    // --------------------------------
    // Required headers
    // --------------------------------

    if (!signatureHeader || !timestamp) {
      return res.status(401).json({
        success: false,
        error: "Invalid webhook signature",
      });
    }

    // --------------------------------
    // Validate timestamp
    // --------------------------------

    const timestampMs = Number(timestamp);

    if (!Number.isFinite(timestampMs)) {
      return res.status(401).json({
        success: false,
        error: "Invalid webhook timestamp",
      });
    }

    const timestampAge = Math.abs(Date.now() - timestampMs);

    if (timestampAge > TIMESTAMP_TOLERANCE_MS) {
      return res.status(401).json({
        success: false,
        error: "Webhook timestamp is outside the allowed tolerance",
      });
    }

    // --------------------------------
    // Get raw request body
    // --------------------------------

    if (!Buffer.isBuffer(req.body)) {
      console.error(
        "Revolut webhook raw body is unavailable. " +
          "Make sure express.raw() is applied before this middleware."
      );

      return res.status(500).json({
        success: false,
        error: "Webhook verification could not be performed",
      });
    }

    const rawBody = req.body.toString("utf8");

    // --------------------------------
    // Signing payload
    // --------------------------------

    const payloadToSign =
      `${SIGNATURE_VERSION}.${timestamp}.${rawBody}`;

    // --------------------------------
    // Support multiple active secrets
    //
    // This is useful while Revolut's
    // signing secret is being rotated.
    //
    // Example:
    // REVOLUT_WEBHOOK_SIGNING_SECRETS=
    // secret1,secret2
    // --------------------------------

    const secrets = (
      process.env.REVOLUT_WEBHOOK_SIGNING_SECRETS ||
      process.env.REVOLUT_WEBHOOK_SIGNING_SECRET ||
      ""
    )
      .split(",")
      .map((secret) => secret.trim())
      .filter(Boolean);

    if (secrets.length === 0) {
      console.error(
        "Revolut webhook signing secret is not configured"
      );

      return res.status(500).json({
        success: false,
        error: "Webhook verification is not configured",
      });
    }

    // --------------------------------
    // Extract all v1 signatures
    // --------------------------------

    const signatures = signatureHeader
      .split(",")
      .map((signature) => signature.trim())
      .filter((signature) =>
        signature.startsWith(`${SIGNATURE_VERSION}=`)
      );

    if (signatures.length === 0) {
      return res.status(401).json({
        success: false,
        error: "Invalid webhook signature",
      });
    }

    // --------------------------------
    // Compare against every active
    // signing secret and every signature
    // --------------------------------

    let signatureValid = false;

    for (const secret of secrets) {
      const expectedDigest = crypto
        .createHmac("sha256", secret)
        .update(payloadToSign, "utf8")
        .digest("hex");

      const expectedSignature =
        `${SIGNATURE_VERSION}=${expectedDigest}`;

      const expectedBuffer = Buffer.from(expectedSignature);

      for (const receivedSignature of signatures) {
        const receivedBuffer = Buffer.from(receivedSignature);

        if (
          expectedBuffer.length === receivedBuffer.length &&
          crypto.timingSafeEqual(
            expectedBuffer,
            receivedBuffer
          )
        ) {
          signatureValid = true;
          break;
        }
      }

      if (signatureValid) {
        break;
      }
    }

    if (!signatureValid) {
      return res.status(401).json({
        success: false,
        error: "Invalid webhook signature",
      });
    }

    // --------------------------------
    // Signature is valid.
    //
    // Parse the raw JSON only AFTER
    // signature verification.
    // --------------------------------

    try {
      req.body = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({
        success: false,
        error: "Invalid webhook JSON payload",
      });
    }

    next();
  } catch (error) {
    console.error(
      "Revolut webhook verification error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Webhook verification failed",
    });
  }
};