import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, upsert } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { idempotencyKey: { findUnique, upsert } },
}));

import { AuthzError } from "@/lib/authz";
import {
  canonicalJson,
  requestHashFor,
  withIdempotencyKey,
} from "./idempotency";

describe("canonicalJson", () => {
  it("is key-order invariant and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: null, c: [2, 1] } })).toBe(
      canonicalJson({ a: { c: [2, 1], d: null }, b: 1 }),
    );
    expect(canonicalJson({ a: 1, skip: undefined })).toBe(
      canonicalJson({ a: 1 }),
    );
    // Array order still matters.
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
});

describe("withIdempotencyKey (P2.4 acceptance)", () => {
  beforeEach(() => {
    findUnique.mockReset();
    upsert.mockReset();
    upsert.mockResolvedValue({});
  });

  const ARGS = { columnId: "col_1", title: "T", idempotencyKey: "key-1" };
  const STORED = { id: "task_1", number: 7, key: "STK-7" };

  function storedRow(overrides: Record<string, unknown> = {}) {
    return {
      tokenId: "tok_1",
      key: "key-1",
      requestHash: requestHashFor("create_task", {
        columnId: "col_1",
        title: "T",
      }),
      response: STORED,
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    };
  }

  it("runs fn directly when no key is provided", async () => {
    const fn = vi.fn().mockResolvedValue(STORED);
    const result = await withIdempotencyKey(
      "tok_1",
      "create_task",
      { columnId: "col_1", title: "T" },
      fn,
    );
    expect(result).toEqual(STORED);
    expect(findUnique).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("first use executes fn and stores the response", async () => {
    findUnique.mockResolvedValue(null);
    const fn = vi.fn().mockResolvedValue(STORED);
    const result = await withIdempotencyKey("tok_1", "create_task", ARGS, fn);
    expect(result).toEqual(STORED);
    expect(fn).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledOnce();
    const call = upsert.mock.calls[0][0];
    expect(call.create.response).toEqual(STORED);
  });

  it("duplicate create replays the stored result — fn never runs (one task)", async () => {
    findUnique.mockResolvedValue(storedRow());
    const fn = vi.fn();
    const result = await withIdempotencyKey("tok_1", "create_task", ARGS, fn);
    expect(result).toEqual(STORED);
    expect(fn).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("same key with different arguments → CONFLICT (409)", async () => {
    findUnique.mockResolvedValue(storedRow());
    const fn = vi.fn();
    const err = await withIdempotencyKey(
      "tok_1",
      "create_task",
      { ...ARGS, title: "DIFFERENT" },
      fn,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(AuthzError);
    expect((err as AuthzError).status).toBe(409);
    expect(fn).not.toHaveBeenCalled();
  });

  it("an expired row is overwritten, not replayed", async () => {
    findUnique.mockResolvedValue(
      storedRow({ expiresAt: new Date(Date.now() - 1000) }),
    );
    const fresh = { id: "task_2", number: 8, key: "STK-8" };
    const fn = vi.fn().mockResolvedValue(fresh);
    const result = await withIdempotencyKey("tok_1", "create_task", ARGS, fn);
    expect(result).toEqual(fresh);
    expect(fn).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledOnce();
  });

  it("keys are scoped per tool name — same args, different tool, different hash", () => {
    const args = { columnId: "col_1", title: "T" };
    expect(requestHashFor("create_task", args)).not.toBe(
      requestHashFor("create_comment", args),
    );
  });
});
