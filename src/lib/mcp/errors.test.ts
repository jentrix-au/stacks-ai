import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AuthzError, StaleWriteError } from "@/lib/authz";
import { RateLimitError } from "@/lib/rate-limit";
import { errorPayload, toErrorPayload } from "./errors";

describe("errorPayload", () => {
  it("builds the exact envelope shape", () => {
    expect(
      errorPayload("NOT_FOUND", "Task not found", "Try list_tasks"),
    ).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Task not found",
        hint: "Try list_tasks",
      },
    });
  });

  it("omits hint and retryAfterSeconds keys when absent", () => {
    const payload = errorPayload("INTERNAL", "boom");
    expect(payload).toEqual({ error: { code: "INTERNAL", message: "boom" } });
    expect("hint" in payload.error).toBe(false);
    expect("retryAfterSeconds" in payload.error).toBe(false);
  });

  it("survives a JSON round-trip (what the agent actually parses)", () => {
    const payload = errorPayload("RATE_LIMITED", "slow down", "wait", 30);
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });
});

describe("toErrorPayload", () => {
  it("maps AuthzError 403 (default) to FORBIDDEN with a role hint", () => {
    const { error } = toErrorPayload(new AuthzError("Requires ADMIN role"));
    expect(error.code).toBe("FORBIDDEN");
    expect(error.message).toBe("Requires ADMIN role");
    expect(error.hint).toContain("list_workspaces");
  });

  it("maps AuthzError 404 to NOT_FOUND with a discovery hint", () => {
    const { error } = toErrorPayload(new AuthzError("Board not found", 404));
    expect(error.code).toBe("NOT_FOUND");
    expect(error.hint).toContain("list_boards");
  });

  it("maps AuthzError 400 to INVALID_INPUT", () => {
    const { error } = toErrorPayload(
      new AuthzError("Must provide boardId or columnId to list_tasks", 400),
    );
    expect(error.code).toBe("INVALID_INPUT");
  });

  it("maps AuthzError 409 to CONFLICT", () => {
    const { error } = toErrorPayload(new AuthzError("Stale update", 409));
    expect(error.code).toBe("CONFLICT");
  });

  it("maps ZodError to INVALID_INPUT listing field paths", () => {
    const result = z
      .object({ title: z.string(), take: z.number().max(100) })
      .safeParse({ take: 500 });
    expect(result.success).toBe(false);
    const { error } = toErrorPayload(result.error);
    expect(error.code).toBe("INVALID_INPUT");
    expect(error.message).toContain("title");
    expect(error.message).toContain("take");
    expect(error.hint).toContain("input schema");
  });

  it("maps RateLimitError to RATE_LIMITED with retryAfterSeconds", () => {
    const { error } = toErrorPayload(
      new RateLimitError("Rate limit exceeded (60 requests/min)", 42),
    );
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.retryAfterSeconds).toBe(42);
    expect(error.hint).toContain("42");
  });

  it("maps StaleWriteError to CONFLICT embedding the current entity", () => {
    const { error } = toErrorPayload(
      new StaleWriteError("Stale write rejected", {
        id: "task_1",
        title: "Current",
        updatedAt: "2026-06-12T10:00:00.000Z",
      }),
    );
    expect(error.code).toBe("CONFLICT");
    expect(error.current).toEqual({
      id: "task_1",
      title: "Current",
      updatedAt: "2026-06-12T10:00:00.000Z",
    });
    expect(error.hint).toContain("expectedUpdatedAt");
  });

  it("maps a plain Error to INTERNAL", () => {
    const { error } = toErrorPayload(new Error("db exploded"));
    expect(error.code).toBe("INTERNAL");
    expect(error.message).toBe("db exploded");
  });

  it("maps a non-Error throw to INTERNAL", () => {
    const { error } = toErrorPayload("boom");
    expect(error.code).toBe("INTERNAL");
    expect(error.message).toBe("Unknown error");
  });
});
