import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueMember, findUniqueTask, findUniqueOrThrowWorkspace, queryRaw } =
  vi.hoisted(() => ({
    findUniqueMember: vi.fn(),
    findUniqueTask: vi.fn(),
    findUniqueOrThrowWorkspace: vi.fn(),
    queryRaw: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({
  db: {
    workspaceMember: { findUnique: findUniqueMember },
    task: { findUnique: findUniqueTask },
    workspace: { findUniqueOrThrow: findUniqueOrThrowWorkspace },
    $queryRaw: queryRaw,
  },
}));

import { AuthzError } from "@/lib/authz";
import {
  EMPTY_SEARCH_RESULTS,
  escapeLike,
  searchTasksPage,
  searchWorkspace,
} from "./search";

const MEMBER = { id: "m1", role: "MEMBER" };

describe("escapeLike", () => {
  it("escapes LIKE wildcards and backslashes", () => {
    expect(escapeLike("50%_done\\x")).toBe("50\\%\\_done\\\\x");
  });

  it("leaves plain text untouched", () => {
    expect(escapeLike("expired card")).toBe("expired card");
  });
});

describe("searchWorkspace", () => {
  beforeEach(() => {
    findUniqueMember.mockReset();
    findUniqueOrThrowWorkspace.mockReset();
    queryRaw.mockReset();
  });

  it("rejects non-members before querying", async () => {
    findUniqueMember.mockResolvedValue(null);
    const err = await searchWorkspace("u1", {
      workspaceId: "ws1",
      query: "x",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(AuthzError);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("short-circuits empty/whitespace queries without hitting the DB", async () => {
    findUniqueMember.mockResolvedValue(MEMBER);
    await expect(
      searchWorkspace("u1", { workspaceId: "ws1", query: "   " }),
    ).resolves.toEqual(EMPTY_SEARCH_RESULTS);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("maps rows: composes task keys and ISO dates, passes hits through", async () => {
    findUniqueMember.mockResolvedValue(MEMBER);
    findUniqueOrThrowWorkspace.mockResolvedValue({ taskPrefix: "DEM" });
    const due = new Date("2026-07-01T00:00:00.000Z");
    queryRaw
      // tasks
      .mockResolvedValueOnce([
        {
          id: "t1",
          number: 6,
          title: "Checkout crashes",
          priority: "URGENT",
          dueAt: due,
          updatedAt: new Date(),
          columnId: "c1",
          columnName: "Confirmed",
          boardId: "b1",
          boardName: "Bug tracker",
          boardSlug: "bugs",
          boardKind: "BUGS",
        },
      ])
      // boards
      .mockResolvedValueOnce([
        { id: "b1", name: "Bug tracker", slug: "bugs", kind: "BUGS" },
      ])
      // contacts
      .mockResolvedValueOnce([
        { id: "ct1", name: "Dana Reyes", email: "dana@globex.com", company: "Globex" },
      ]);

    const res = await searchWorkspace("u1", {
      workspaceId: "ws1",
      query: "expired",
    });
    expect(res.tasks).toEqual([
      expect.objectContaining({
        key: "DEM-6",
        dueAt: "2026-07-01T00:00:00.000Z",
        boardSlug: "bugs",
        columnName: "Confirmed",
      }),
    ]);
    expect(res.boards).toHaveLength(1);
    expect(res.contacts[0].email).toBe("dana@globex.com");
    expect(queryRaw).toHaveBeenCalledTimes(3);
  });
});

describe("searchTasksPage", () => {
  beforeEach(() => {
    findUniqueTask.mockReset();
    queryRaw.mockReset();
  });

  it("rejects an unknown cursor as INVALID_INPUT (400)", async () => {
    findUniqueTask.mockResolvedValue(null);
    const err = await searchTasksPage({
      workspaceId: "ws1",
      query: "x",
      take: 10,
      cursor: "missing",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(AuthzError);
    expect((err as AuthzError).status).toBe(400);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("returns rows with a numeric totalCount (bigint coerced)", async () => {
    queryRaw
      .mockResolvedValueOnce([{ count: BigInt(7) }])
      .mockResolvedValueOnce([{ id: "t1" }]);
    const page = await searchTasksPage({
      workspaceId: "ws1",
      query: "x",
      take: 10,
    });
    expect(page.totalCount).toBe(7);
    expect(page.rows).toHaveLength(1);
    expect(findUniqueTask).not.toHaveBeenCalled();
  });
});
