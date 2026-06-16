import { describe, expect, it } from "vitest";

import { sortTasks } from "./board-filters";
import type { FullTask } from "@/server/queries/boards";

function task(over: {
  id: string;
  priority?: string;
  dueAt?: string | null;
  createdAt?: string;
}): FullTask {
  return {
    id: over.id,
    priority: over.priority ?? "MEDIUM",
    dueAt: over.dueAt ? new Date(over.dueAt) : null,
    createdAt: new Date(over.createdAt ?? "2026-01-01T00:00:00Z"),
  } as unknown as FullTask;
}

describe("sortTasks", () => {
  it("null sort returns the input order untouched (manual positions)", () => {
    const tasks = [task({ id: "b" }), task({ id: "a" })];
    expect(sortTasks(tasks, null)).toBe(tasks);
  });

  it("priority: URGENT → HIGH → MEDIUM → LOW", () => {
    const tasks = [
      task({ id: "low", priority: "LOW" }),
      task({ id: "urgent", priority: "URGENT" }),
      task({ id: "medium", priority: "MEDIUM" }),
      task({ id: "high", priority: "HIGH" }),
    ];
    expect(sortTasks(tasks, "priority").map((t) => t.id)).toEqual([
      "urgent",
      "high",
      "medium",
      "low",
    ]);
  });

  it("due: earliest first, undated last", () => {
    const tasks = [
      task({ id: "none", dueAt: null }),
      task({ id: "later", dueAt: "2026-07-01" }),
      task({ id: "soon", dueAt: "2026-06-13" }),
    ];
    expect(sortTasks(tasks, "due").map((t) => t.id)).toEqual([
      "soon",
      "later",
      "none",
    ]);
  });

  it("newest: most recently created first; does not mutate the input", () => {
    const tasks = [
      task({ id: "old", createdAt: "2026-01-01T00:00:00Z" }),
      task({ id: "new", createdAt: "2026-06-01T00:00:00Z" }),
    ];
    const sorted = sortTasks(tasks, "newest");
    expect(sorted.map((t) => t.id)).toEqual(["new", "old"]);
    expect(tasks.map((t) => t.id)).toEqual(["old", "new"]);
  });
});
