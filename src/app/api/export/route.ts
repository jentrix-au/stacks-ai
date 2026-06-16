import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { requireWorkspaceRole, AuthzError } from "@/lib/authz";
import { toCsv } from "@/lib/csv";

/**
 * Board/workspace export (P3.8), session-authed.
 *
 * GET /api/export?workspaceId=…[&boardId=…]&format=csv|json
 *
 * JSON nests boards → columns → tasks; CSV is one flat task row per line.
 * Archived boards/columns/tasks are excluded.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId");
  const boardId = url.searchParams.get("boardId");
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }
  try {
    await requireWorkspaceRole(session.user.id, workspaceId);
  } catch (e) {
    const status = e instanceof AuthzError ? e.status : 403;
    return NextResponse.json({ error: "Forbidden" }, { status });
  }

  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { name: true, slug: true, taskPrefix: true },
  });
  const boards = await db.board.findMany({
    where: {
      workspaceId,
      archivedAt: null,
      ...(boardId ? { id: boardId } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      kind: true,
      columns: {
        where: { archivedAt: null },
        orderBy: { position: "asc" },
        select: {
          id: true,
          name: true,
          tasks: {
            where: { archivedAt: null },
            orderBy: { position: "asc" },
            select: {
              id: true,
              number: true,
              title: true,
              description: true,
              priority: true,
              dueAt: true,
              createdAt: true,
              updatedAt: true,
              labels: { select: { label: { select: { name: true } } } },
              assignees: {
                select: { user: { select: { name: true, email: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (boardId && boards.length === 0) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const base = boardId ? boards[0].slug : workspace.slug;

  if (format === "json") {
    const payload = {
      workspace: { name: workspace.name, slug: workspace.slug },
      exportedAt: new Date().toISOString(),
      boards: boards.map((b) => ({
        name: b.name,
        slug: b.slug,
        kind: b.kind,
        columns: b.columns.map((c) => ({
          name: c.name,
          tasks: c.tasks.map((t) => ({
            key: `${workspace.taskPrefix}-${t.number}`,
            title: t.title,
            description: t.description,
            priority: t.priority,
            dueAt: t.dueAt,
            labels: t.labels.map((l) => l.label.name),
            assignees: t.assignees.map((a) => a.user.name ?? a.user.email),
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          })),
        })),
      })),
    };
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${base}-${stamp}.json"`,
      },
    });
  }

  const rows: (string | null)[][] = [
    [
      "key",
      "board",
      "column",
      "title",
      "description",
      "priority",
      "dueAt",
      "labels",
      "assignees",
    ],
  ];
  for (const b of boards) {
    for (const c of b.columns) {
      for (const t of c.tasks) {
        rows.push([
          `${workspace.taskPrefix}-${t.number}`,
          b.name,
          c.name,
          t.title,
          t.description ?? "",
          t.priority,
          t.dueAt ? t.dueAt.toISOString() : "",
          t.labels.map((l) => l.label.name).join("; "),
          t.assignees.map((a) => a.user.name ?? a.user.email).join("; "),
        ]);
      }
    }
  }
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}-${stamp}.csv"`,
    },
  });
}

export const runtime = "nodejs";
