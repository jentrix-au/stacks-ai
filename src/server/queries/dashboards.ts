import { cache } from "react";
import { ActivityType, BoardKind } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * P3.5 dashboards: one fetch + one PURE aggregation per board kind, so the
 * numbers are unit-testable against seed-shaped fixtures. All fetches are
 * workspace-scoped and exclude archived tasks/columns/boards. Deal.amount is
 * Decimal — converted to Number right here at the query boundary.
 */

const openTaskWhere = (workspaceId: string, kind: BoardKind) => ({
  workspaceId,
  archivedAt: null as null,
  column: { archivedAt: null, board: { archivedAt: null, kind } },
});

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------

export interface CrmDealRow {
  amount: number | null;
  currency: string | null;
  expectedCloseAt: Date | null;
  stage: string;
  stagePosition: number;
  owners: string[]; // assignee display names; empty = unassigned
}

export interface CrmDashboard {
  dealCount: number;
  totalValue: number;
  currency: string;
  byStage: { name: string; value: number; count: number }[];
  closingThisQuarter: { count: number; value: number };
  byOwner: { name: string; value: number; count: number }[];
}

export function quarterRange(now: Date): { start: Date; end: Date } {
  const q = Math.floor(now.getMonth() / 3);
  const start = new Date(now.getFullYear(), q * 3, 1);
  const end = new Date(now.getFullYear(), q * 3 + 3, 1);
  return { start, end };
}

export function aggregateCrm(rows: CrmDealRow[], now: Date): CrmDashboard {
  const { start, end } = quarterRange(now);
  const stages = new Map<string, { pos: number; value: number; count: number }>();
  const owners = new Map<string, { value: number; count: number }>();
  let totalValue = 0;
  let closingCount = 0;
  let closingValue = 0;

  for (const r of rows) {
    const amount = r.amount ?? 0;
    totalValue += amount;
    const stage = stages.get(r.stage) ?? {
      pos: r.stagePosition,
      value: 0,
      count: 0,
    };
    stage.value += amount;
    stage.count += 1;
    stages.set(r.stage, stage);

    if (r.expectedCloseAt && r.expectedCloseAt >= start && r.expectedCloseAt < end) {
      closingCount += 1;
      closingValue += amount;
    }

    // Multi-assignee deals attribute the full amount to each owner.
    const names = r.owners.length > 0 ? r.owners : ["Unassigned"];
    for (const name of names) {
      const o = owners.get(name) ?? { value: 0, count: 0 };
      o.value += amount;
      o.count += 1;
      owners.set(name, o);
    }
  }

  return {
    dealCount: rows.length,
    totalValue,
    currency: rows.find((r) => r.currency)?.currency ?? "USD",
    byStage: [...stages.entries()]
      .sort((a, b) => a[1].pos - b[1].pos)
      .map(([name, s]) => ({ name, value: s.value, count: s.count })),
    closingThisQuarter: { count: closingCount, value: closingValue },
    byOwner: [...owners.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .map(([name, o]) => ({ name, value: o.value, count: o.count })),
  };
}

export const getCrmDashboard = cache(
  async (workspaceId: string): Promise<CrmDashboard | null> => {
    const deals = await db.deal.findMany({
      where: { task: openTaskWhere(workspaceId, BoardKind.CRM) },
      select: {
        amount: true,
        currency: true,
        expectedCloseAt: true,
        task: {
          select: {
            column: { select: { name: true, position: true } },
            assignees: {
              select: { user: { select: { name: true, email: true } } },
            },
          },
        },
      },
    });
    if (deals.length === 0) return null;
    return aggregateCrm(
      deals.map((d) => ({
        amount: d.amount === null ? null : Number(d.amount),
        currency: d.currency,
        expectedCloseAt: d.expectedCloseAt,
        stage: d.task.column.name,
        stagePosition: d.task.column.position,
        owners: d.task.assignees.map(
          (a) => a.user.name ?? a.user.email ?? "Unknown",
        ),
      })),
      new Date(),
    );
  },
);

// ---------------------------------------------------------------------------
// SUPPORT
// ---------------------------------------------------------------------------

export interface TicketRow {
  severity: string | null;
  slaDueAt: Date | null;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface SupportDashboard {
  openCount: number;
  openBySeverity: { name: string; value: number }[];
  slaBreaches: number;
  avgFirstResponseHours: number | null;
}

export function aggregateSupport(
  rows: TicketRow[],
  now: Date,
): SupportDashboard {
  const open = rows.filter((r) => r.resolvedAt === null);
  const bySeverity = new Map<string, number>();
  for (const r of open) {
    const key = r.severity ?? "Unset";
    bySeverity.set(key, (bySeverity.get(key) ?? 0) + 1);
  }
  const responded = rows.filter((r) => r.firstResponseAt !== null);
  const avg =
    responded.length === 0
      ? null
      : responded.reduce(
          (sum, r) =>
            sum + (r.firstResponseAt!.getTime() - r.createdAt.getTime()),
          0,
        ) /
        responded.length /
        3_600_000;
  return {
    openCount: open.length,
    openBySeverity: [...bySeverity.entries()].map(([name, value]) => ({
      name,
      value,
    })),
    slaBreaches: open.filter((r) => r.slaDueAt !== null && r.slaDueAt < now)
      .length,
    avgFirstResponseHours: avg,
  };
}

export const getSupportDashboard = cache(
  async (workspaceId: string): Promise<SupportDashboard | null> => {
    const tickets = await db.ticket.findMany({
      where: { task: openTaskWhere(workspaceId, BoardKind.SUPPORT) },
      select: {
        severity: true,
        slaDueAt: true,
        firstResponseAt: true,
        resolvedAt: true,
        createdAt: true,
      },
    });
    if (tickets.length === 0) return null;
    return aggregateSupport(tickets, new Date());
  },
);

// ---------------------------------------------------------------------------
// BUGS
// ---------------------------------------------------------------------------

export interface BugRow {
  severity: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface BugsDashboard {
  openCount: number;
  openBySeverity: { name: string; value: number }[];
  avgResolutionHours: number | null;
  reopenedCount: number;
}

export function aggregateBugs(
  rows: BugRow[],
  reopenedCount: number,
): BugsDashboard {
  const open = rows.filter((r) => r.resolvedAt === null);
  const bySeverity = new Map<string, number>();
  for (const r of open) {
    const key = r.severity ?? "Unset";
    bySeverity.set(key, (bySeverity.get(key) ?? 0) + 1);
  }
  const resolved = rows.filter((r) => r.resolvedAt !== null);
  const avg =
    resolved.length === 0
      ? null
      : resolved.reduce(
          (sum, r) => sum + (r.resolvedAt!.getTime() - r.createdAt.getTime()),
          0,
        ) /
        resolved.length /
        3_600_000;
  return {
    openCount: open.length,
    openBySeverity: [...bySeverity.entries()].map(([name, value]) => ({
      name,
      value,
    })),
    avgResolutionHours: avg,
    reopenedCount,
  };
}

export const getBugsDashboard = cache(
  async (workspaceId: string): Promise<BugsDashboard | null> => {
    const [bugs, reopened] = await Promise.all([
      db.bugReport.findMany({
        where: { task: openTaskWhere(workspaceId, BoardKind.BUGS) },
        select: { severity: true, resolvedAt: true, createdAt: true },
      }),
      db.activity.count({
        where: {
          type: ActivityType.BUG_REOPENED,
          task: { workspaceId, archivedAt: null },
        },
      }),
    ]);
    if (bugs.length === 0) return null;
    return aggregateBugs(bugs, reopened);
  },
);

// ---------------------------------------------------------------------------
// ROADMAP
// ---------------------------------------------------------------------------

export interface InitiativeRow {
  quarter: string | null;
  blocked: boolean;
}

export interface RoadmapDashboard {
  total: number;
  blocked: number;
  byQuarter: { name: string; total: number; blocked: number }[];
}

export function aggregateRoadmap(rows: InitiativeRow[]): RoadmapDashboard {
  const byQuarter = new Map<string, { total: number; blocked: number }>();
  for (const r of rows) {
    const key = r.quarter ?? "Unscheduled";
    const q = byQuarter.get(key) ?? { total: 0, blocked: 0 };
    q.total += 1;
    if (r.blocked) q.blocked += 1;
    byQuarter.set(key, q);
  }
  return {
    total: rows.length,
    blocked: rows.filter((r) => r.blocked).length,
    byQuarter: [...byQuarter.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, q]) => ({ name, ...q })),
  };
}

export const getRoadmapDashboard = cache(
  async (workspaceId: string): Promise<RoadmapDashboard | null> => {
    const initiatives = await db.initiative.findMany({
      where: { task: openTaskWhere(workspaceId, BoardKind.ROADMAP) },
      select: {
        targetQuarter: true,
        task: {
          select: {
            incomingLinks: {
              where: { kind: "BLOCKS" },
              select: { from: { select: { archivedAt: true } } },
            },
          },
        },
      },
    });
    if (initiatives.length === 0) return null;
    return aggregateRoadmap(
      initiatives.map((i) => ({
        quarter: i.targetQuarter,
        blocked: i.task.incomingLinks.some((l) => l.from.archivedAt === null),
      })),
    );
  },
);
