import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Webhook security primitives (P2.6): HMAC signing and the SSRF guard.
// The guard is mandatory in production — https only, no private/link-local
// destinations, no redirects (enforced at fetch time), 5s timeout.

export const SIGNATURE_VERSION = "sha256";

/**
 * Stripe-style signature over `${timestamp}.${body}`. Sent as
 * `X-Stacks-Signature: sha256=<hex>` with `X-Stacks-Timestamp: <unix s>`.
 */
export function signWebhookBody(
  secret: string,
  timestamp: string,
  body: string,
): string {
  const hex = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `${SIGNATURE_VERSION}=${hex}`;
}

/** Constant-time check a receiver can mirror; exported for tests/docs. */
export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  const expected = signWebhookBody(secret, timestamp, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

const PRIVATE_V4 = [
  /^0\./, // "this network"
  /^10\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // 100.64/10 CGNAT
  /^127\./,
  /^169\.254\./, // link-local
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
];

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return PRIVATE_V4.some((re) => re.test(address));
  if (family === 6) {
    const lower = address.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7
    if (lower.startsWith("fe8") || lower.startsWith("fe9")) return true; // fe80::/10
    if (lower.startsWith("fea") || lower.startsWith("feb")) return true;
    if (lower.startsWith("::ffff:")) {
      return isPrivateAddress(lower.slice("::ffff:".length));
    }
    return false;
  }
  return false;
}

/** Escape hatch for tests and local-receiver development ONLY. */
function allowInsecure(): boolean {
  return process.env.STACKS_WEBHOOK_ALLOW_PRIVATE === "1";
}

/**
 * SSRF guard: throws unless the URL is https with a public destination.
 * Resolves the hostname and rejects private / link-local / loopback ranges.
 * Run both at webhook creation and immediately before every delivery.
 */
export async function assertSafeWebhookUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid webhook URL");
  }
  if (allowInsecure()) return;

  if (url.protocol !== "https:") {
    throw new Error("Webhook URLs must use https");
  }
  if (url.username || url.password) {
    throw new Error("Webhook URLs must not embed credentials");
  }
  const host = url.hostname;
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error("Webhook URLs must not target localhost");
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new Error("Webhook URLs must not target private addresses");
    }
    return;
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new Error(`Webhook host "${host}" does not resolve`);
  }
  if (addresses.length === 0) {
    throw new Error(`Webhook host "${host}" does not resolve`);
  }
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new Error(
        "Webhook URLs must not resolve to private addresses",
      );
    }
  }
}
