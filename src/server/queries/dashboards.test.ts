import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import {
  aggregateBugs,
  aggregateCrm,
  aggregateRoadmap,
  aggregateSupport,
  quarterRange,
} from "./dashboards";

// Fixtures mirror prisma/seed.ts exactly: one $48k USD deal in Negotiation
// (unassigned), one open HIGH ticket (no first response), one open CRITICAL
// bug (never reopened), one 2026-Q3 initiative blocked by the bug.
const NOW = new Date("2026-06-12T12:00:00Z");

describe("dashboards reconcile with the seed data", () => {
  it("CRM: $48k pipeline, all in Negotiation, unassigned, none closing this quarter", () => {
    const crm = aggregateCrm(
      [
        {
          amount: 48_000,
          currency: "USD",
          expectedCloseAt: null,
          stage: "Negotiation",
          stagePosition: 2048,
          owners: [],
        },
      ],
      NOW,
    );
    expect(crm.dealCount).toBe(1);
    expect(crm.totalValue).toBe(48_000);
    expect(crm.currency).toBe("USD");
    expect(crm.byStage).toEqual([
      { name: "Negotiation", value: 48_000, count: 1 },
    ]);
    expect(crm.closingThisQuarter).toEqual({ count: 0, value: 0 });
    expect(crm.byOwner).toEqual([
      { name: "Unassigned", value: 48_000, count: 1 },
    ]);
  });

  it("SUPPORT: one open HIGH ticket, no breaches, no first-response data", () => {
    const support = aggregateSupport(
      [
        {
          severity: "HIGH",
          slaDueAt: null,
          firstResponseAt: null,
          resolvedAt: null,
          createdAt: NOW,
        },
      ],
      NOW,
    );
    expect(support.openCount).toBe(1);
    expect(support.openBySeverity).toEqual([{ name: "HIGH", value: 1 }]);
    expect(support.slaBreaches).toBe(0);
    expect(support.avgFirstResponseHours).toBeNull();
  });

  it("BUGS: one open CRITICAL bug, nothing resolved, zero reopens", () => {
    const bugs = aggregateBugs(
      [{ severity: "CRITICAL", resolvedAt: null, createdAt: NOW }],
      0,
    );
    expect(bugs.openCount).toBe(1);
    expect(bugs.openBySeverity).toEqual([{ name: "CRITICAL", value: 1 }]);
    expect(bugs.avgResolutionHours).toBeNull();
    expect(bugs.reopenedCount).toBe(0);
  });

  it("ROADMAP: one 2026-Q3 initiative, blocked", () => {
    const roadmap = aggregateRoadmap([{ quarter: "2026-Q3", blocked: true }]);
    expect(roadmap.total).toBe(1);
    expect(roadmap.blocked).toBe(1);
    expect(roadmap.byQuarter).toEqual([
      { name: "2026-Q3", total: 1, blocked: 1 },
    ]);
  });
});

describe("aggregation mechanics", () => {
  it("quarterRange covers Apr–Jun for a June date", () => {
    const { start, end } = quarterRange(new Date("2026-06-12T12:00:00"));
    expect(start.getMonth()).toBe(3); // April
    expect(end.getMonth()).toBe(6); // exclusive July
  });

  it("CRM: deals closing inside the quarter are counted; owners attributed", () => {
    const crm = aggregateCrm(
      [
        {
          amount: 1000,
          currency: "USD",
          expectedCloseAt: new Date("2026-06-30"),
          stage: "Won",
          stagePosition: 1,
          owners: ["Ada", "Grace"],
        },
        {
          amount: 500,
          currency: "USD",
          expectedCloseAt: new Date("2026-07-01"),
          stage: "Lead",
          stagePosition: 0,
          owners: ["Ada"],
        },
      ],
      NOW,
    );
    expect(crm.closingThisQuarter).toEqual({ count: 1, value: 1000 });
    // Stages ordered by column position.
    expect(crm.byStage.map((s) => s.name)).toEqual(["Lead", "Won"]);
    // Multi-assignee deals attribute the full amount to each owner.
    expect(crm.byOwner).toEqual([
      { name: "Ada", value: 1500, count: 2 },
      { name: "Grace", value: 1000, count: 1 },
    ]);
  });

  it("SUPPORT: breached = unresolved past slaDueAt; avg first response in hours", () => {
    const created = new Date("2026-06-12T00:00:00Z");
    const support = aggregateSupport(
      [
        {
          severity: "URGENT",
          slaDueAt: new Date("2026-06-12T06:00:00Z"),
          firstResponseAt: new Date("2026-06-12T03:00:00Z"),
          resolvedAt: null,
          createdAt: created,
        },
        {
          severity: "LOW",
          slaDueAt: new Date("2026-06-11T00:00:00Z"),
          firstResponseAt: null,
          resolvedAt: new Date("2026-06-11T12:00:00Z"), // resolved → not breached
          createdAt: created,
        },
      ],
      NOW,
    );
    expect(support.openCount).toBe(1);
    expect(support.slaBreaches).toBe(1);
    expect(support.avgFirstResponseHours).toBe(3);
  });

  it("BUGS: avg resolution over resolved bugs only", () => {
    const bugs = aggregateBugs(
      [
        {
          severity: "MAJOR",
          resolvedAt: new Date("2026-06-02T00:00:00Z"),
          createdAt: new Date("2026-06-01T00:00:00Z"),
        },
        { severity: "MINOR", resolvedAt: null, createdAt: NOW },
      ],
      2,
    );
    expect(bugs.openCount).toBe(1);
    expect(bugs.avgResolutionHours).toBe(24);
    expect(bugs.reopenedCount).toBe(2);
  });

  it("ROADMAP: null quarter buckets as Unscheduled", () => {
    const roadmap = aggregateRoadmap([
      { quarter: null, blocked: false },
      { quarter: "2026-Q3", blocked: true },
      { quarter: "2026-Q3", blocked: false },
    ]);
    expect(roadmap.byQuarter).toEqual([
      { name: "2026-Q3", total: 2, blocked: 1 },
      { name: "Unscheduled", total: 1, blocked: 0 },
    ]);
  });
});
