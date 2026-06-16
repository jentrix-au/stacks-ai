import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { workspaceMember: { findUnique } },
}));

import { AuthzError, requireWorkspaceRole } from "@/lib/authz";
import {
  restrictedWorkspaceId,
  runWithWorkspaceRestriction,
} from "./authz-context";

describe("runWithWorkspaceRestriction", () => {
  it("is unrestricted outside any context", () => {
    expect(restrictedWorkspaceId()).toBeNull();
  });

  it("is a no-op for null/undefined (unscoped tokens, UI actions)", () => {
    runWithWorkspaceRestriction(null, () => {
      expect(restrictedWorkspaceId()).toBeNull();
    });
    runWithWorkspaceRestriction(undefined, () => {
      expect(restrictedWorkspaceId()).toBeNull();
    });
  });

  it("exposes the workspace inside the context, including across awaits", async () => {
    await runWithWorkspaceRestriction("ws_1", async () => {
      expect(restrictedWorkspaceId()).toBe("ws_1");
      await Promise.resolve();
      expect(restrictedWorkspaceId()).toBe("ws_1");
    });
    expect(restrictedWorkspaceId()).toBeNull();
  });
});

describe("requireWorkspaceRole under a workspace restriction", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("rejects a different workspace with 403 before touching the database", async () => {
    const err = await runWithWorkspaceRestriction("ws_allowed", () =>
      requireWorkspaceRole("user_1", "ws_other"),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(AuthzError);
    expect((err as AuthzError).status).toBe(403);
    expect((err as AuthzError).message).toContain("restricted");
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("allows the restricted workspace itself (membership still checked)", async () => {
    findUnique.mockResolvedValue({ role: "MEMBER" });
    const member = await runWithWorkspaceRestriction("ws_allowed", () =>
      requireWorkspaceRole("user_1", "ws_allowed"),
    );
    expect(member).toEqual({ role: "MEMBER" });
    expect(findUnique).toHaveBeenCalledOnce();
  });

  it("does not restrict session-based (UI) calls outside the context", async () => {
    findUnique.mockResolvedValue({ role: "MEMBER" });
    await expect(
      requireWorkspaceRole("user_1", "ws_anything"),
    ).resolves.toEqual({ role: "MEMBER" });
  });
});
