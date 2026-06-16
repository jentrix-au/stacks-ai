import { describe, expect, it } from "vitest";

import { applySidecarPatch } from "./realtime-patch";

const board = () => ({
  columns: [
    {
      tasks: [
        {
          id: "t1",
          deal: { amount: 100, currency: "USD", expectedCloseAt: null },
          ticket: null,
        },
        { id: "t2", deal: null, ticket: { severity: "LOW", slaDueAt: null } },
      ],
    },
  ],
});

describe("applySidecarPatch", () => {
  it("merges the patch into the right task's sidecar without mutating input", () => {
    const b = board();
    const next = applySidecarPatch(b, "deal.updated", {
      taskId: "t1",
      patch: { amount: 250, currency: "EUR" },
    });
    expect(next).not.toBeNull();
    expect(next!.columns[0].tasks[0].deal).toEqual({
      amount: 250,
      currency: "EUR",
      expectedCloseAt: null,
    });
    // Untouched task is the same reference; the input board is unchanged.
    expect(next!.columns[0].tasks[1]).toBe(b.columns[0].tasks[1]);
    expect(b.columns[0].tasks[0].deal!.amount).toBe(100);
  });

  it("revives ISO strings into Dates for sidecar date fields", () => {
    const next = applySidecarPatch(board(), "ticket.updated", {
      taskId: "t2",
      patch: { slaDueAt: "2026-06-13T10:00:00.000Z", severity: "URGENT" },
    });
    const ticket = next!.columns[0].tasks[1].ticket as unknown as {
      slaDueAt: Date;
      severity: string;
    };
    expect(ticket.slaDueAt).toBeInstanceOf(Date);
    expect(ticket.slaDueAt.toISOString()).toBe("2026-06-13T10:00:00.000Z");
    expect(ticket.severity).toBe("URGENT");
  });

  it("returns null for unpatchable cases → caller refreshes", () => {
    // Unknown event.
    expect(applySidecarPatch(board(), "task.moved", { taskId: "t1" })).toBeNull();
    // No patch payload.
    expect(
      applySidecarPatch(board(), "deal.updated", { taskId: "t1" }),
    ).toBeNull();
    // Task not in local state (filtered out / other page).
    expect(
      applySidecarPatch(board(), "deal.updated", {
        taskId: "missing",
        patch: { amount: 1 },
      }),
    ).toBeNull();
    // Sidecar not loaded on the task.
    expect(
      applySidecarPatch(board(), "ticket.updated", {
        taskId: "t1",
        patch: { severity: "LOW" },
      }),
    ).toBeNull();
  });
});
