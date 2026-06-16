import { createHash, randomBytes } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => {
  const dbMock = {
    oAuthAuthCode: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    oAuthRefreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    apiToken: { create: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return { dbMock };
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

import {
  exchangeAuthorizationCode,
  OAuthGrantError,
  parseScopes,
  rotateRefreshToken,
  verifyPkce,
} from "./service";

const CLIENT = {
  id: "client_db_1",
  clientId: "https://claude.ai/client-metadata.json",
  name: "Claude",
};

function pkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function wireHappyTransaction() {
  dbMock.$transaction.mockImplementation(
    async (fn: (tx: typeof dbMock) => Promise<unknown>) => fn(dbMock),
  );
  dbMock.apiToken.create.mockResolvedValue({ id: "tok_access_1" });
  dbMock.oAuthRefreshToken.create.mockResolvedValue({});
}

beforeEach(() => {
  for (const group of Object.values(dbMock)) {
    if (typeof group === "function") (group as ReturnType<typeof vi.fn>).mockReset();
    else
      for (const fn of Object.values(group))
        (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  wireHappyTransaction();
});

describe("verifyPkce (S256 only)", () => {
  it("accepts a matching verifier and rejects everything else", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce(verifier + "x", challenge)).toBe(false);
    expect(verifyPkce("short", challenge)).toBe(false);
    expect(verifyPkce("", challenge)).toBe(false);
  });
});

describe("parseScopes", () => {
  it("defaults to read+write, never silently grants admin", () => {
    expect(parseScopes(null)).toEqual(["read", "write"]);
    expect(parseScopes("read write admin")).toEqual([
      "read",
      "write",
      "admin",
    ]);
    expect(parseScopes("read")).toEqual(["read"]);
    expect(() => parseScopes("everything")).toThrow(OAuthGrantError);
  });
});

describe("exchangeAuthorizationCode (P2.7 acceptance)", () => {
  const { verifier, challenge } = pkcePair();

  function codeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "code_1",
      clientDbId: CLIENT.id,
      userId: "user_1",
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      scopes: ["read", "write"],
      workspaceId: null,
      codeChallenge: challenge,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      client: CLIENT,
      ...overrides,
    };
  }

  const goodInput = {
    code: "raw-code",
    codeVerifier: verifier,
    clientId: CLIENT.clientId,
    redirectUri: "https://claude.ai/api/mcp/auth_callback",
  };

  it("happy path: consumes the code once and issues tmo_/tmr_ tokens", async () => {
    dbMock.oAuthAuthCode.findUnique.mockResolvedValue(codeRow());
    dbMock.oAuthAuthCode.updateMany.mockResolvedValue({ count: 1 });

    const pair = await exchangeAuthorizationCode(goodInput);
    expect(pair.accessToken).toMatch(/^tmo_/);
    expect(pair.refreshToken).toMatch(/^tmr_/);
    expect(pair.scopes).toEqual(["read", "write"]);
    // single-use claim was atomic (guarded on consumedAt: null)
    expect(dbMock.oAuthAuthCode.updateMany).toHaveBeenCalledWith({
      where: { id: "code_1", consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it("a code cannot be used twice", async () => {
    dbMock.oAuthAuthCode.findUnique.mockResolvedValue(codeRow());
    dbMock.oAuthAuthCode.updateMany.mockResolvedValue({ count: 0 });
    await expect(exchangeAuthorizationCode(goodInput)).rejects.toThrow(
      /already used/,
    );
    expect(dbMock.apiToken.create).not.toHaveBeenCalled();
  });

  it("rejects an expired code", async () => {
    dbMock.oAuthAuthCode.findUnique.mockResolvedValue(
      codeRow({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(exchangeAuthorizationCode(goodInput)).rejects.toThrow(
      /expired/,
    );
  });

  it("redirect_uri must match EXACTLY", async () => {
    dbMock.oAuthAuthCode.findUnique.mockResolvedValue(codeRow());
    await expect(
      exchangeAuthorizationCode({
        ...goodInput,
        redirectUri: "https://claude.ai/api/mcp/auth_callback/", // trailing slash
      }),
    ).rejects.toThrow(/redirect_uri/);
  });

  it("rejects a wrong PKCE verifier", async () => {
    dbMock.oAuthAuthCode.findUnique.mockResolvedValue(codeRow());
    await expect(
      exchangeAuthorizationCode({
        ...goodInput,
        codeVerifier: randomBytes(48).toString("base64url"),
      }),
    ).rejects.toThrow(/PKCE/);
  });

  it("rejects a code issued to a different client", async () => {
    dbMock.oAuthAuthCode.findUnique.mockResolvedValue(codeRow());
    await expect(
      exchangeAuthorizationCode({
        ...goodInput,
        clientId: "https://evil.example.com/metadata.json",
      }),
    ).rejects.toThrow(/another client/);
  });
});

describe("rotateRefreshToken (P2.7 acceptance)", () => {
  function refreshRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "rt_1",
      clientDbId: CLIENT.id,
      userId: "user_1",
      scopes: ["read", "write"],
      workspaceId: "ws_1",
      accessTokenId: "tok_access_old",
      expiresAt: new Date(Date.now() + 60_000),
      rotatedAt: null,
      revokedAt: null,
      client: CLIENT,
      ...overrides,
    };
  }

  it("rotates: marks the old token used, revokes its access token, issues a new pair", async () => {
    dbMock.oAuthRefreshToken.findUnique.mockResolvedValue(refreshRow());
    dbMock.oAuthRefreshToken.updateMany.mockResolvedValue({ count: 1 });
    dbMock.apiToken.updateMany.mockResolvedValue({ count: 1 });

    const pair = await rotateRefreshToken({
      refreshToken: "tmr_old",
      clientId: CLIENT.clientId,
    });
    expect(pair.accessToken).toMatch(/^tmo_/);
    expect(pair.refreshToken).toMatch(/^tmr_/);
    expect(dbMock.oAuthRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: "rt_1", rotatedAt: null },
      data: { rotatedAt: expect.any(Date) },
    });
    expect(dbMock.apiToken.updateMany).toHaveBeenCalledWith({
      where: { id: "tok_access_old", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("a rotated refresh token cannot be used again", async () => {
    dbMock.oAuthRefreshToken.findUnique.mockResolvedValue(refreshRow());
    dbMock.oAuthRefreshToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      rotateRefreshToken({
        refreshToken: "tmr_old",
        clientId: CLIENT.clientId,
      }),
    ).rejects.toThrow(/already used/);
    expect(dbMock.apiToken.create).not.toHaveBeenCalled();
  });

  it("rejects expired/revoked tokens and client mismatches", async () => {
    dbMock.oAuthRefreshToken.findUnique.mockResolvedValue(
      refreshRow({ revokedAt: new Date() }),
    );
    await expect(
      rotateRefreshToken({
        refreshToken: "tmr_old",
        clientId: CLIENT.clientId,
      }),
    ).rejects.toThrow(/expired/);

    dbMock.oAuthRefreshToken.findUnique.mockResolvedValue(refreshRow());
    await expect(
      rotateRefreshToken({
        refreshToken: "tmr_old",
        clientId: "https://evil.example.com/metadata.json",
      }),
    ).rejects.toThrow(/another client/);
  });

  it("the grant inherits scopes and workspace restriction", async () => {
    dbMock.oAuthRefreshToken.findUnique.mockResolvedValue(refreshRow());
    dbMock.oAuthRefreshToken.updateMany.mockResolvedValue({ count: 1 });
    dbMock.apiToken.updateMany.mockResolvedValue({ count: 1 });

    await rotateRefreshToken({
      refreshToken: "tmr_old",
      clientId: CLIENT.clientId,
    });
    const created = dbMock.apiToken.create.mock.calls[0][0].data;
    expect(created.scopes).toEqual(["read", "write"]);
    expect(created.workspaceId).toBe("ws_1");
    expect(created.expiresAt).toBeInstanceOf(Date);
  });
});
