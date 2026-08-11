const crypto = require('crypto');

/**
 * Verifies an inbound Revolut webhook request per doc 7.3 ("Webhook
 * Verification... backend should verify the signature to confirm the
 * originality of the request from Revolut").
 *
 * The doc doesn't specify the exact algorithm, so this follows Revolut's
 * documented webhook signing scheme:
 *   - HMAC-SHA256, keyed with the webhook's signing secret
 *   - signed string = "v1." + <Revolut-Request-Timestamp header> + "." + <raw request body>
 *   - expected header format: "Revolut-Signature: v1=<hex digest>"
 *     (can contain multiple comma-separated v1=... values during secret
 *     rotation — any match is considered valid)
 *   - Revolut-Request-Timestamp is also checked against a 5-minute
 *     tolerance window to mitigate replay attacks.
 *
 * IMPORTANT: this must run against the *raw* request body bytes, not a
 * JSON.parse'd/re-serialized object — re-serializing can reorder keys or
 * change whitespace and silently break every signature check. The route
 * wiring this controller onto must use raw-body parsing (see webhookRoutes.js)
 * rather than the app's global express.json() for this specific path.
 */

const REVOLUT_WEBHOOK_SIGNING_SECRET = process.env.REVOLUT_WEBHOOK_SIGNING_SECRET;
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes, per Revolut's guidance

function verifyRevolutWebhookSignature({ rawBody, signatureHeader, timestampHeader }) {
  if (!REVOLUT_WEBHOOK_SIGNING_SECRET) {
    const err = new Error('REVOLUT_WEBHOOK_SIGNING_SECRET is not configured');
    err.status = 500;
    throw err;
  }

  if (!signatureHeader || !timestampHeader) {
    return false;
  }

  const timestampMs = Number(timestampHeader);
  if (!Number.isFinite(timestampMs)) {
    return false;
  }
  if (Math.abs(Date.now() - timestampMs) > TIMESTAMP_TOLERANCE_MS) {
    // Too old (or clock-skewed) to trust — also blocks naive replay attacks.
    return false;
  }

  const payloadToSign = `v1.${timestampHeader}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac('sha256', REVOLUT_WEBHOOK_SIGNING_SECRET)
    .update(payloadToSign, 'utf8')
    .digest('hex');

  // Header can carry multiple comma-separated "v1=<hex>" values while two
  // signing secrets are valid during rotation — a match on any is accepted.
  const providedSignatures = signatureHeader
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith('v1='))
    .map((entry) => entry.slice('v1='.length));

  return providedSignatures.some((provided) =>
    timingSafeEqualHex(provided, expectedSignature)
  );
}

function timingSafeEqualHex(a, b) {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  verifyRevolutWebhookSignature,
};