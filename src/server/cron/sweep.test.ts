import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/events", () => ({ emitBoardEvent: vi.fn() }));
vi.mock("@/lib/webhooks/deliver", () => ({ drainDueDeliveries: vi.fn() }));

import {
  DUE_SOON_WINDOW_MS,
  dueSoonMarker,
  selectDueSoon,
  selectSlaBreaches,
} from "./sweep";

const NOW = new Date("2026-06-12T12:00:00Z");

describe("selectDueSoon (injected clock)", () => {
  const inWindow = new Date(NOW.getTime() + DUE_SOON_WINDOW_MS / 2);
  const beyondWindow = new Date(NOW.getTime() + DUE_SOON_WINDOW_MS + 60_000);
  const past = new Date(NOW.getTime() - 60_000);

  it("picks tasks due within 24h and already-overdue tasks; skips far-future and undated", () => {
    const out = selectDueSoon(
      [
        { id: "soon", dueAt: inWindow },
        { id: "overdue", dueAt: past },
        { id: "later", dueAt: beyondWindow },
        { id: "undated", dueAt: null },
      ],
      new Set(),
      NOW,
    );
    expect(out.map((s) => s.taskId)).toEqual(["soon", "overdue"]);
    expect(out[0].overdue).toBe(false);
    expect(out[1].overdue).toBe(true);
  });

  it("reminds at most once per (dueAt, phase) — a second sweep is silent", () => {
    const first = selectDueSoon([{ id: "t", dueAt: inWindow }], new Set(), NOW);
    expect(first).toHaveLength(1);
    const sent = new Set(first.map((s) => s.marker));
    const second = selectDueSoon([{ id: "t", dueAt: inWindow }], sent, NOW);
    expect(second).toHaveLength(0);
  });

  it("fires again when the task becomes overdue (new phase)…", () => {
    const sent = new Set([dueSoonMarker("t", past, false)]);
    const out = selectDueSoon([{ id: "t", dueAt: past }], sent, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].overdue).toBe(true);
  });

  it("…and when the due date changes (new marker)", () => {
    const oldDue = inWindow;
    const newDue = new Date(inWindow.getTime() + 3_600_000);
    const sent = new Set([dueSoonMarker("t", oldDue, false)]);
    const out = selectDueSoon([{ id: "t", dueAt: newDue }], sent, NOW);
    expect(out).toHaveLength(1);
  });
});

describe("selectSlaBreaches (injected clock)", () => {
  const pastSla = new Date(NOW.getTime() - 3_600_000);
  const futureSla = new Date(NOW.getTime() + 3_600_000);

  it("breaches unresolved tickets past their SLA", () => {
    const out = selectSlaBreaches(
      [
        { taskId: "hit", slaDueAt: pastSla, resolvedAt: null, severity: null },
        { taskId: "ok", slaDueAt: futureSla, resolvedAt: null, severity: null },
        { taskId: "nosla", slaDueAt: null, resolvedAt: null, severity: null },
        {
          taskId: "resolved",
          slaDueAt: pastSla,
          resolvedAt: NOW,
          severity: null,
        },
      ],
      new Set(),
      NOW,
    );
    expect(out).toEqual([{ taskId: "hit", slaDueAt: pastSla }]);
  });

  it("breach fires exactly once per ticket — the activity marker suppresses repeats", () => {
    const tickets = [
      {
        taskId: "hit",
        slaDueAt: pastSla,
        resolvedAt: null,
        severity: null,
      },
    ];
    const first = selectSlaBreaches(tickets, new Set(), NOW);
    expect(first).toHaveLength(1);
    // The SLA_BREACHED activity is written transactionally with the
    // notifications, so the next sweep sees the marker:
    const second = selectSlaBreaches(tickets, new Set(["hit"]), NOW);
    expect(second).toHaveLength(0);
    // …even much later.
    const muchLater = new Date(NOW.getTime() + 7 * 24 * 3_600_000);
    expect(selectSlaBreaches(tickets, new Set(["hit"]), muchLater)).toHaveLength(
      0,
    );
  });
});
