import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { restrictedWorkspaceId } from "@/lib/authz-context";
import { safe } from "./tools";

function authExtra(
  scopes: string[],
  extra: Record<string, unknown> = { userId: "user_1" },
) {
  return { authInfo: { scopes, extra } };
}

function parse(result: { content: Array<{ type: string; text?: string }> }) {
  return JSON.parse(result.content[0].text ?? "null");
}

describe("safe() — P2.1 acceptance", () => {
  it("read-only token cannot mutate: structured FORBIDDEN with hint, op never runs", async () => {
    const op = vi.fn().mockResolvedValue({ ok: true });
    const result = await safe(authExtra(["read"]), "write", op);
    expect(result.isError).toBe(true);
    expect(op).not.toHaveBeenCalled();
    const payload = parse(result);
    expect(payload.error.code).toBe("FORBIDDEN");
    expect(payload.error.message).toContain('"write" scope');
    expect(payload.error.hint).toBeTruthy();
  });

  it("write token cannot use the admin surface", async () => {
    const op = vi.fn();
    const result = await safe(authExtra(["read", "write"]), "admin", op);
    expect(result.isError).toBe(true);
    expect(parse(result).error.code).toBe("FORBIDDEN");
    expect(op).not.toHaveBeenCalled();
  });

  it("token with the right scope runs the op and returns its value", async () => {
    const op = vi.fn().mockResolvedValue({ id: "task_1" });
    const result = await safe(authExtra(["write"]), "write", op);
    expect(result.isError).toBeUndefined();
    expect(parse(result)).toEqual({ id: "task_1" });
  });

  it("pins workspace-scoped tokens via the authz restriction context", async () => {
    let seen: string | null = "unset" as string | null;
    const op = vi.fn(async () => {
      seen = restrictedWorkspaceId();
      return { ok: true };
    });
    await safe(
      authExtra(["read"], { userId: "user_1", allowedWorkspaceId: "ws_1" }),
      "read",
      op,
    );
    expect(seen).toBe("ws_1");
    // ...and unscoped tokens stay unrestricted.
    await safe(authExtra(["read"]), "read", op);
    expect(seen).toBeNull();
  });

  it("rate limiting still wins over scope checks", async () => {
    const op = vi.fn();
    const result = await safe(
      {
        authInfo: {
          scopes: ["read", "write", "admin"],
          extra: { userId: "user_1", rateLimit: { retryAfterSeconds: 30 } },
        },
      },
      "read",
      op,
    );
    expect(result.isError).toBe(true);
    const payload = parse(result);
    expect(payload.error.code).toBe("RATE_LIMITED");
    expect(payload.error.retryAfterSeconds).toBe(30);
    expect(op).not.toHaveBeenCalled();
  });
});
