import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, update, upsert, usageUpsert } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  usageUpsert: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    apiToken: { findUnique, update },
    apiTokenRateLimit: { upsert },
    apiTokenUsage: { upsert: usageUpsert },
  },
}));

import { generateToken, TokenError, verifyToken } from "./api-tokens";

function tokenRecord(overrides: Record<string, unknown> = {}) {
  const { token, hash } = generateToken();
  return {
    token,
    record: {
      id: "tok_1",
      userId: "user_1",
      name: "Test token",
      tokenHash: hash,
      scopes: [] as string[],
      workspaceId: null as string | null,
      revokedAt: null,
      expiresAt: null,
      lastUsedAt: new Date(),
      ...overrides,
    },
  };
}

describe("verifyToken scopes + workspace", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
    upsert.mockReset();
    upsert.mockResolvedValue({ count: 1 });
    update.mockResolvedValue({});
    usageUpsert.mockReset();
    usageUpsert.mockResolvedValue({});
  });

  it("grandfathers pre-scope tokens (empty array) to full access", async () => {
    const { token, record } = tokenRecord();
    findUnique.mockResolvedValue(record);
    const verified = await verifyToken(token);
    expect(verified.scopes).toEqual(["read", "write", "admin"]);
    expect(verified.workspaceId).toBeNull();
  });

  it("returns the stored scopes and workspace restriction", async () => {
    const { token, record } = tokenRecord({
      scopes: ["read"],
      workspaceId: "ws_1",
    });
    findUnique.mockResolvedValue(record);
    const verified = await verifyToken(token);
    expect(verified.scopes).toEqual(["read"]);
    expect(verified.workspaceId).toBe("ws_1");
  });

  it("still rejects revoked tokens", async () => {
    const { token, record } = tokenRecord({ revokedAt: new Date() });
    findUnique.mockResolvedValue(record);
    await expect(verifyToken(token)).rejects.toThrow(TokenError);
  });
});
