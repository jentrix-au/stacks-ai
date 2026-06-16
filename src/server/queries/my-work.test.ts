import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { partitionByDue } from "./my-work";

const NOW = new Date("2026-06-12T15:30:00");

function row(dueAt: string | null) {
  return { dueAt: dueAt ? new Date(dueAt) : null };
}

describe("partitionByDue", () => {
  it("buckets overdue / due-today / the rest, mutually exclusively", () => {
    const overdueYesterday = row("2026-06-11T23:59:00");
    const lastWeek = row("2026-06-05T09:00:00");
    const todayMorning = row("2026-06-12T00:00:00");
    const todayLate = row("2026-06-12T23:59:59");
    const tomorrow = row("2026-06-13T00:00:00");
    const noDue = row(null);

    const rows = [
      overdueYesterday,
      lastWeek,
      todayMorning,
      todayLate,
      tomorrow,
      noDue,
    ];
    const { overdue, dueToday, assigned } = partitionByDue(rows, NOW);

    expect(overdue).toEqual([overdueYesterday, lastWeek]);
    expect(dueToday).toEqual([todayMorning, todayLate]);
    expect(assigned).toEqual([tomorrow, noDue]);
    expect(overdue.length + dueToday.length + assigned.length).toBe(
      rows.length,
    );
  });

  it("a task due earlier today is due-today, not overdue", () => {
    const earlierToday = row("2026-06-12T08:00:00");
    const { overdue, dueToday } = partitionByDue([earlierToday], NOW);
    expect(overdue).toHaveLength(0);
    expect(dueToday).toEqual([earlierToday]);
  });

  it("handles empty input", () => {
    expect(partitionByDue([], NOW)).toEqual({
      overdue: [],
      dueToday: [],
      assigned: [],
    });
  });
});
