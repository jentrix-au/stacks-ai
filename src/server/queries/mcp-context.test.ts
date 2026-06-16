import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { task: { findUnique } },
}));

import { AuthzError } from "@/lib/authz";
import { resolveMcpTaskId } from "./mcp-context";

describe("resolveMcpTaskId", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("passes a taskId through without touching the database", async () => {
    await expect(resolveMcpTaskId({ taskId: "task_1" })).resolves.toBe(
      "task_1",
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("resolves { workspaceId, number } via the unique pair", async () => {
    findUnique.mockResolvedValue({ id: "task_42" });
    await expect(
      resolveMcpTaskId({ workspaceId: "ws_1", number: 42 }),
    ).resolves.toBe("task_42");
    expect(findUnique).toHaveBeenCalledWith({
      where: { workspaceId_number: { workspaceId: "ws_1", number: 42 } },
      select: { id: true },
    });
  });

  it("prefers taskId when both forms are provided", async () => {
    await expect(
      resolveMcpTaskId({ taskId: "task_1", workspaceId: "ws_1", number: 42 }),
    ).resolves.toBe("task_1");
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the number does not exist", async () => {
    findUnique.mockResolvedValue(null);
    const err = await resolveMcpTaskId({
      workspaceId: "ws_1",
      number: 999,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(AuthzError);
    expect((err as AuthzError).status).toBe(404);
  });

  it("throws INVALID_INPUT when neither form is provided", async () => {
    for (const ref of [{}, { workspaceId: "ws_1" }, { number: 42 }]) {
      const err = await resolveMcpTaskId(ref).catch((e) => e);
      expect(err).toBeInstanceOf(AuthzError);
      expect((err as AuthzError).status).toBe(400);
    }
  });
});
