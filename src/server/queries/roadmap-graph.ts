import { cache } from "react";
import { BoardKind, TaskLinkKind } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * P3.5 roadmap dependency graph: every non-archived ROADMAP initiative plus
 * any task linked to one via BLOCKS/DEPENDS_ON (one hop — that's how a bug
 * on another board shows up as the blocker). Rebuilt over TaskLink after
 * InitiativeDependency was dropped in P1.2.
 */

export interface RoadmapGraphNode {
  id: string;
  taskKey: string;
  title: string;
  quarter: string | null;
  boardKind: BoardKind;
  boardSlug: string;
  blocked: boolean;
}

export interface RoadmapGraphEdge {
  fromTaskId: string;
  toTaskId: string;
  kind: "BLOCKS" | "DEPENDS_ON";
}

const NODE_SELECT = {
  id: true,
  number: true,
  title: true,
  initiative: { select: { targetQuarter: true } },
  column: {
    select: { board: { select: { kind: true, slug: true } } },
  },
} as const;

export const getRoadmapGraph = cache(
  async (
    workspaceId: string,
  ): Promise<{ nodes: RoadmapGraphNode[]; edges: RoadmapGraphEdge[] }> => {
    const openTask = {
      archivedAt: null as null,
      column: { archivedAt: null, board: { archivedAt: null } },
    };

    const [workspace, initiativeTasks] = await Promise.all([
      db.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { taskPrefix: true },
      }),
      db.task.findMany({
        where: {
          workspaceId,
          ...openTask,
          initiative: { isNot: null },
          column: {
            archivedAt: null,
            board: { archivedAt: null, kind: BoardKind.ROADMAP },
          },
        },
        select: NODE_SELECT,
        orderBy: { number: "asc" },
      }),
    ]);

    const initiativeIds = initiativeTasks.map((t) => t.id);
    const links = await db.taskLink.findMany({
      where: {
        kind: { in: [TaskLinkKind.BLOCKS, TaskLinkKind.DEPENDS_ON] },
        OR: [
          { fromTaskId: { in: initiativeIds } },
          { toTaskId: { in: initiativeIds } },
        ],
      },
      select: { fromTaskId: true, toTaskId: true, kind: true },
    });

    // One-hop neighbors (blockers/dependencies on other boards).
    const inGraph = new Set(initiativeIds);
    const neighborIds = [
      ...new Set(
        links
          .flatMap((l) => [l.fromTaskId, l.toTaskId])
          .filter((id) => !inGraph.has(id)),
      ),
    ];
    const neighbors =
      neighborIds.length === 0
        ? []
        : await db.task.findMany({
            where: { id: { in: neighborIds }, ...openTask },
            select: NODE_SELECT,
          });
    for (const n of neighbors) inGraph.add(n.id);

    // Drop edges whose endpoint fell out (archived neighbor).
    const edges = links
      .filter((l) => inGraph.has(l.fromTaskId) && inGraph.has(l.toTaskId))
      .map((l) => ({
        fromTaskId: l.fromTaskId,
        toTaskId: l.toTaskId,
        kind: l.kind as "BLOCKS" | "DEPENDS_ON",
      }));

    const blockedIds = new Set(
      edges.filter((e) => e.kind === "BLOCKS").map((e) => e.toTaskId),
    );

    const toNode = (t: (typeof initiativeTasks)[number]): RoadmapGraphNode => ({
      id: t.id,
      taskKey: `${workspace.taskPrefix}-${t.number}`,
      title: t.title,
      quarter: t.initiative?.targetQuarter ?? null,
      boardKind: t.column.board.kind,
      boardSlug: t.column.board.slug,
      blocked: blockedIds.has(t.id),
    });

    return {
      nodes: [...initiativeTasks.map(toNode), ...neighbors.map(toNode)],
      edges,
    };
  },
);
