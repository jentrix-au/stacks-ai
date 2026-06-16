import { db } from "@/lib/db";
import { assertSafeWebhookUrl } from "@/lib/webhooks/security";

// CIMD client resolution (P2.7): the OAuth client_id IS an https URL whose
// JSON document describes the client (client_id_metadata_document, MCP auth
// guidance 2025-11-25). We fetch it (SSRF-guarded, same rules as webhooks),
// validate, and cache in OAuthClient.

const METADATA_MAX_BYTES = 64 * 1024;
const METADATA_CACHE_MS = 60 * 60 * 1000; // re-fetch after 1h
const FETCH_TIMEOUT_MS = 5_000;

export class OAuthClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthClientError";
  }
}

interface ClientMetadata {
  name: string;
  redirectUris: string[];
  logoUri: string | null;
  raw: Record<string, unknown>;
}

function parseMetadata(
  clientId: string,
  json: Record<string, unknown>,
): ClientMetadata {
  // Per CIMD, the document's client_id must equal the URL it was fetched from.
  if (typeof json.client_id === "string" && json.client_id !== clientId) {
    throw new OAuthClientError(
      "Client metadata client_id does not match its URL",
    );
  }
  const redirectUris = Array.isArray(json.redirect_uris)
    ? json.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];
  if (redirectUris.length === 0) {
    throw new OAuthClientError("Client metadata has no redirect_uris");
  }
  for (const uri of redirectUris) {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      throw new OAuthClientError(`Invalid redirect_uri: ${uri}`);
    }
    const isLoopback =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !isLoopback) {
      throw new OAuthClientError(
        `redirect_uri must be https (or loopback): ${uri}`,
      );
    }
  }
  return {
    name:
      typeof json.client_name === "string" && json.client_name.trim()
        ? json.client_name.trim().slice(0, 120)
        : new URL(clientId).hostname,
    redirectUris,
    logoUri: typeof json.logo_uri === "string" ? json.logo_uri : null,
    raw: json,
  };
}

async function fetchMetadata(clientId: string): Promise<ClientMetadata> {
  await assertSafeWebhookUrl(clientId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(clientId, {
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new OAuthClientError(
        `Client metadata fetch failed (HTTP ${res.status})`,
      );
    }
    const text = await res.text();
    if (text.length > METADATA_MAX_BYTES) {
      throw new OAuthClientError("Client metadata document too large");
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new OAuthClientError("Client metadata is not valid JSON");
    }
    if (typeof json !== "object" || json === null || Array.isArray(json)) {
      throw new OAuthClientError("Client metadata must be a JSON object");
    }
    return parseMetadata(clientId, json as Record<string, unknown>);
  } catch (e) {
    if (e instanceof OAuthClientError) throw e;
    throw new OAuthClientError(
      `Client metadata fetch failed: ${e instanceof Error ? e.message : "error"}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve a CIMD client_id (https URL) to a cached OAuthClient row,
 * fetching/refreshing the metadata document when missing or stale.
 */
export async function resolveClient(clientId: string) {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    throw new OAuthClientError("client_id must be an https URL (CIMD)");
  }
  if (url.protocol !== "https:") {
    throw new OAuthClientError("client_id must be an https URL (CIMD)");
  }

  const cached = await db.oAuthClient.findUnique({ where: { clientId } });
  if (cached && Date.now() - cached.updatedAt.getTime() < METADATA_CACHE_MS) {
    return cached;
  }

  let metadata: ClientMetadata;
  try {
    metadata = await fetchMetadata(clientId);
  } catch (e) {
    // Serve a stale cache rather than breaking refresh flows on a blip.
    if (cached) return cached;
    throw e;
  }

  return db.oAuthClient.upsert({
    where: { clientId },
    create: {
      clientId,
      name: metadata.name,
      redirectUris: metadata.redirectUris,
      logoUri: metadata.logoUri,
      metadata: metadata.raw as never,
    },
    update: {
      name: metadata.name,
      redirectUris: metadata.redirectUris,
      logoUri: metadata.logoUri,
      metadata: metadata.raw as never,
    },
  });
}
