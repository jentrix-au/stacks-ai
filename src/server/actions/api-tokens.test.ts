import { beforeEach, describe, expect, it, vi } from "vitest";

// Pins the authorization shape of token management: per-user isolation for
// personal actions, ADMIN role + workspace-bounded WHERE for governance.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(async () => ({ id: "user-1" })),
}));
vi.mock("@/lib/authz", () => ({ requireWorkspaceRole: vi.fn() }));

const updateMany = vi.fn(async () => ({ count: 1 }));
const findMany = vi.fn(async () => []);
const findUnique = vi.fn(async () => ({ slug: "demo" }));
vi.mock("@/lib/db", () => ({
  db: {
    apiToken: {
      get updateMany() {
        return updateMany;
      },
      get findMany() {
        return findMany;
      },
    },
    workspace: {
      get findUnique() {
        return findUnique;
      },
    },
  },
}));

import { requireWorkspaceRole } from "@/lib/authz";
import { OAUTH_TOKEN_PREFIX } from "@/lib/api-tokens";
import {
  listWorkspaceTokens,
  revokeApiToken,
  revokeWorkspaceToken,
} from "./api-tokens";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("revokeApiToken (personal)", () => {
  it("scopes the revocation to the caller's own tokens in the WHERE clause", async () => {
    await revokeApiToken("tok-1");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tok-1", userId: "user-1", revokedAt: null },
      }),
    );
  });

  it("reports revoked: false when the token isn't the caller's", async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(revokeApiToken("someone-elses")).resolves.toEqual({
      revoked: false,
    });
  });
});

describe("listWorkspaceTokens (governance)", () => {
  it("requires the ADMIN role on that workspace and lists only pinned tokens", async () => {
    await listWorkspaceTokens({ workspaceId: "ws-1" });
    expect(requireWorkspaceRole).toHaveBeenCalledWith(
      "user-1",
      "ws-1",
      "ADMIN",
    );
    // Scoped to the workspace AND excludes dead OAuth access tokens (the NOT
    // clause keys on the OAuth token prefix — see hideDeadOAuthTokens).
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "ws-1",
          NOT: expect.objectContaining({
            tokenPrefix: { startsWith: OAUTH_TOKEN_PREFIX },
          }),
        }),
      }),
    );
  });

  it("propagates an authz rejection before touching the database", async () => {
    vi.mocked(requireWorkspaceRole).mockRejectedValueOnce(
      new Error("Requires ADMIN role or higher"),
    );
    await expect(listWorkspaceTokens({ workspaceId: "ws-1" })).rejects.toThrow(
      /ADMIN/,
    );
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("revokeWorkspaceToken (governance)", () => {
  it("checks ADMIN and bounds the UPDATE to tokens pinned to that workspace", async () => {
    await revokeWorkspaceToken({ workspaceId: "ws-1", tokenId: "tok-9" });
    expect(requireWorkspaceRole).toHaveBeenCalledWith(
      "user-1",
      "ws-1",
      "ADMIN",
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tok-9", workspaceId: "ws-1", revokedAt: null },
      }),
    );
  });

  it("a token id from another workspace (or unpinned) is a no-op", async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      revokeWorkspaceToken({ workspaceId: "ws-1", tokenId: "other-ws-token" }),
    ).resolves.toEqual({ revoked: false });
  });
});
