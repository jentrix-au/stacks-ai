import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { db } from "@/lib/db";
import { generateOAuthAccessToken, generateToken } from "@/lib/api-tokens";
import { TOKEN_SCOPES, type TokenScope } from "@/lib/token-scopes";

// OAuth 2.1 service core (P2.7). Security posture per UPGRADE-PLAN §5:
// PKCE S256 only, exact redirect_uri match, 10-min single-use codes,
// rotated single-use refresh tokens, everything stored hashed.

export const AUTH_CODE_TTL_MS = 10 * 60 * 1000;
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d
const REFRESH_TOKEN_PREFIX = "tmr_";

export class OAuthGrantError extends Error {
  /** RFC 6749 error code returned to the client. */
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "OAuthGrantError";
    this.code = code;
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Parse + clamp requested scopes; default read+write, never silently admin. */
export function parseScopes(
  scopeParam: string | null | undefined,
): TokenScope[] {
  const requested = (scopeParam ?? "").split(/\s+/).filter(Boolean);
  if (requested.length === 0) return ["read", "write"];
  const valid = TOKEN_SCOPES.filter((s) => requested.includes(s));
  if (valid.length === 0) {
    throw new OAuthGrantError(
      "invalid_scope",
      `Unsupported scopes: ${requested.join(" ")}`,
    );
  }
  return valid;
}

/** PKCE S256: base64url(sha256(verifier)) must equal the stored challenge. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!verifier || verifier.length < 43 || verifier.length > 128) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface IssueAuthCodeInput {
  clientDbId: string;
  userId: string;
  redirectUri: string;
  scopes: TokenScope[];
  workspaceId: string | null;
  codeChallenge: string;
}

/** Create a single-use authorization code; returns the raw code once. */
export async function issueAuthCode(
  input: IssueAuthCodeInput,
): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  await db.oAuthAuthCode.create({
    data: {
      codeHash: sha256Hex(code),
      clientDbId: input.clientDbId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      scopes: input.scopes,
      workspaceId: input.workspaceId,
      codeChallenge: input.codeChallenge,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    },
  });
  return code;
}

export interface TokenPair {
  accessToken: string;
  expiresInSeconds: number;
  refreshToken: string;
  scopes: TokenScope[];
}

async function issueTokenPair(grant: {
  clientDbId: string;
  clientName: string;
  userId: string;
  scopes: string[];
  workspaceId: string | null;
}): Promise<TokenPair> {
  const access = generateOAuthAccessToken();
  const refresh = generateToken(REFRESH_TOKEN_PREFIX);

  await db.$transaction(async (tx) => {
    const accessRow = await tx.apiToken.create({
      data: {
        userId: grant.userId,
        name: `OAuth: ${grant.clientName}`,
        tokenHash: access.hash,
        tokenPrefix: access.prefix,
        scopes: grant.scopes,
        workspaceId: grant.workspaceId,
        // Agent identity (P4.1): badge OAuth-connector actions with the
        // client's own name instead of the technical "OAuth: …" row name.
        displayName: grant.clientName,
        expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
      },
      select: { id: true },
    });
    await tx.oAuthRefreshToken.create({
      data: {
        tokenHash: sha256Hex(refresh.token),
        clientDbId: grant.clientDbId,
        userId: grant.userId,
        scopes: grant.scopes,
        workspaceId: grant.workspaceId,
        accessTokenId: accessRow.id,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
  });

  return {
    accessToken: access.token,
    expiresInSeconds: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refreshToken: refresh.token,
    scopes: grant.scopes as TokenScope[],
  };
}

export interface ExchangeCodeInput {
  code: string;
  codeVerifier: string;
  clientId: string; // CIMD URL
  redirectUri: string;
}

/**
 * authorization_code grant: single-use code consumption (atomic), exact
 * redirect_uri match, PKCE S256 verification — then a fresh token pair.
 */
export async function exchangeAuthorizationCode(
  input: ExchangeCodeInput,
): Promise<TokenPair> {
  const row = await db.oAuthAuthCode.findUnique({
    where: { codeHash: sha256Hex(input.code) },
    include: { client: { select: { id: true, clientId: true, name: true } } },
  });
  if (!row) throw new OAuthGrantError("invalid_grant", "Unknown code");
  if (row.client.clientId !== input.clientId) {
    throw new OAuthGrantError("invalid_grant", "Code issued to another client");
  }
  if (row.expiresAt.getTime() < Date.now()) {
    throw new OAuthGrantError("invalid_grant", "Code expired");
  }
  if (row.redirectUri !== input.redirectUri) {
    throw new OAuthGrantError("invalid_grant", "redirect_uri mismatch");
  }
  if (!verifyPkce(input.codeVerifier, row.codeChallenge)) {
    throw new OAuthGrantError("invalid_grant", "PKCE verification failed");
  }

  // Atomic single-use claim — a replayed code loses this race exactly once.
  const claimed = await db.oAuthAuthCode.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (claimed.count !== 1) {
    throw new OAuthGrantError("invalid_grant", "Code already used");
  }

  return issueTokenPair({
    clientDbId: row.client.id,
    clientName: row.client.name,
    userId: row.userId,
    scopes: row.scopes,
    workspaceId: row.workspaceId,
  });
}

export interface RefreshInput {
  refreshToken: string;
  clientId: string;
}

/**
 * refresh_token grant with rotation: the presented token is single-use;
 * the previous access token is revoked in the same step.
 */
export async function rotateRefreshToken(
  input: RefreshInput,
): Promise<TokenPair> {
  const row = await db.oAuthRefreshToken.findUnique({
    where: { tokenHash: sha256Hex(input.refreshToken) },
    include: { client: { select: { id: true, clientId: true, name: true } } },
  });
  if (!row) throw new OAuthGrantError("invalid_grant", "Unknown refresh token");
  if (row.client.clientId !== input.clientId) {
    throw new OAuthGrantError(
      "invalid_grant",
      "Refresh token issued to another client",
    );
  }
  if (row.revokedAt || row.expiresAt.getTime() < Date.now()) {
    throw new OAuthGrantError("invalid_grant", "Refresh token expired");
  }

  // Atomic rotation claim. A reused (already-rotated) token fails here —
  // revoke its successor's access token family defensively.
  const claimed = await db.oAuthRefreshToken.updateMany({
    where: { id: row.id, rotatedAt: null },
    data: { rotatedAt: new Date() },
  });
  if (claimed.count !== 1) {
    throw new OAuthGrantError("invalid_grant", "Refresh token already used");
  }

  // Revoke the access token this refresh token was paired with.
  if (row.accessTokenId) {
    await db.apiToken.updateMany({
      where: { id: row.accessTokenId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  return issueTokenPair({
    clientDbId: row.client.id,
    clientName: row.client.name,
    userId: row.userId,
    scopes: row.scopes,
    workspaceId: row.workspaceId,
  });
}
