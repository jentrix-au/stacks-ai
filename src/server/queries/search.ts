import { Prisma, type BoardKind, type Priority } from "@prisma/client";
import { db } from "@/lib/db";
import { AuthzError, requireWorkspaceRole } from "@/lib/authz";

/**
 * P3.1 global search — the one Postgres-FTS query layer powering the cmd-K
 * palette, the /[ws]/search page, and the search_tasks MCP tool.
 *
 * Matching is a deliberate superset of the old ILIKE implementation:
 * websearch_to_tsquery over generated tsvector columns (stemmed words,
 * quoted phrases, -negation) OR a trigram-indexed ILIKE substring fallback
 * (prefixes, partial emails), plus comment bodies — a task is findable by
 * what was said about it.
 */

/** Escape LIKE/ILIKE wildcards so user input always matches literally. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function likePattern(q: string): string {
  return `%${escapeLike(q)}%`;
}

/** Task predicate (alias t = Task): title, description, or comment bodies. */
function taskMatchSql(q: string): Prisma.Sql {
  const like = likePattern(q);
  return Prisma.sql`(
    t."searchVector" @@ websearch_to_tsquery('english', ${q})
    OR t."title" ILIKE ${like}
    OR t."description" ILIKE ${like}
    OR EXISTS (
      SELECT 1 FROM "Comment" cm
      WHERE cm."taskId" = t."id"
        AND cm."searchVector" @@ websearch_to_tsquery('english', ${q})
    )
  )`;
}

function taskFromWhereSql(workspaceId: string, q: string): Prisma.Sql {
  return Prisma.sql`
    FROM "Task" t
    JOIN "Column" c ON c."id" = t."columnId"
    JOIN "Board" b ON b."id" = c."boardId"
    WHERE t."workspaceId" = ${workspaceId}
      AND t."archivedAt" IS NULL
      AND c."archivedAt" IS NULL
      AND b."archivedAt" IS NULL
      AND ${taskMatchSql(q)}`;
}

const TASK_SELECT_SQL = Prisma.sql`
  SELECT t."id", t."number", t."title", t."priority", t."dueAt",
         t."updatedAt", t."columnId", c."name" AS "columnName",
         b."id" AS "boardId", b."name" AS "boardName",
         b."slug" AS "boardSlug", b."kind" AS "boardKind"`;

export interface TaskSearchRow {
  id: string;
  number: number;
  title: string;
  priority: Priority;
  dueAt: Date | null;
  updatedAt: Date;
  columnId: string;
  columnName: string;
  boardId: string;
  boardName: string;
  boardSlug: string;
  boardKind: BoardKind;
}

/**
 * Cursor-paged task search, newest-updated first with id as the tiebreaker —
 * the engine behind the search_tasks MCP tool. The cursor is a row id from a
 * previous page, exactly like the pre-FTS Prisma implementation. No authz:
 * callers (searchMcpTasks) check workspace membership first.
 */
export async function searchTasksPage(input: {
  workspaceId: string;
  query: string;
  take: number;
  cursor?: string | null;
}): Promise<{ rows: TaskSearchRow[]; totalCount: number }> {
  const fromWhere = taskFromWhereSql(input.workspaceId, input.query);
  let cursorSql = Prisma.empty;
  if (input.cursor) {
    const row = await db.task.findUnique({
      where: { id: input.cursor },
      select: { updatedAt: true },
    });
    if (!row)
      throw new AuthzError(
        "Unknown cursor — pass the nextCursor from a previous response",
        400,
      );
    cursorSql = Prisma.sql` AND (t."updatedAt" < ${row.updatedAt} OR (t."updatedAt" = ${row.updatedAt} AND t."id" > ${input.cursor}))`;
  }
  const [countRows, rows] = await Promise.all([
    db.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`SELECT count(*) AS count ${fromWhere}`,
    ),
    db.$queryRaw<TaskSearchRow[]>(Prisma.sql`
      ${TASK_SELECT_SQL}
      ${fromWhere}${cursorSql}
      ORDER BY t."updatedAt" DESC, t."id" ASC
      LIMIT ${input.take}`),
  ]);
  return { rows, totalCount: Number(countRows[0]?.count ?? 0) };
}

export interface WorkspaceSearchTaskHit {
  id: string;
  number: number;
  key: string;
  title: string;
  priority: Priority;
  dueAt: string | null;
  columnName: string;
  boardId: string;
  boardName: string;
  boardSlug: string;
  boardKind: BoardKind;
}

export interface WorkspaceSearchBoardHit {
  id: string;
  name: string;
  slug: string;
  kind: BoardKind;
}

export interface WorkspaceSearchContactHit {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
}

export interface WorkspaceSearchResults {
  tasks: WorkspaceSearchTaskHit[];
  boards: WorkspaceSearchBoardHit[];
  contacts: WorkspaceSearchContactHit[];
}

export const EMPTY_SEARCH_RESULTS: WorkspaceSearchResults = {
  tasks: [],
  boards: [],
  contacts: [],
};

/**
 * Workspace-wide search across tasks (FTS-ranked), boards (name), and
 * contacts (name/email/company). Archived entities are excluded at every
 * level. Powers the cmd-K palette and /[ws]/search.
 */
export async function searchWorkspace(
  userId: string,
  input: { workspaceId: string; query: string; takePerType?: number },
): Promise<WorkspaceSearchResults> {
  await requireWorkspaceRole(userId, input.workspaceId);
  const q = input.query.trim();
  if (!q) return EMPTY_SEARCH_RESULTS;
  const take = Math.min(Math.max(input.takePerType ?? 8, 1), 50);
  const like = likePattern(q);

  const [workspace, taskRows, boardRows, contactRows] = await Promise.all([
    db.workspace.findUniqueOrThrow({
      where: { id: input.workspaceId },
      select: { taskPrefix: true },
    }),
    db.$queryRaw<TaskSearchRow[]>(Prisma.sql`
      ${TASK_SELECT_SQL}
      ${taskFromWhereSql(input.workspaceId, q)}
      ORDER BY ts_rank(t."searchVector", websearch_to_tsquery('english', ${q})) DESC,
               t."updatedAt" DESC
      LIMIT ${take}`),
    db.$queryRaw<WorkspaceSearchBoardHit[]>(Prisma.sql`
      SELECT b."id", b."name", b."slug", b."kind"
      FROM "Board" b
      WHERE b."workspaceId" = ${input.workspaceId}
        AND b."archivedAt" IS NULL
        AND b."name" ILIKE ${like}
      ORDER BY b."name" ASC
      LIMIT ${take}`),
    db.$queryRaw<WorkspaceSearchContactHit[]>(Prisma.sql`
      SELECT ct."id", ct."name", ct."email", ct."company"
      FROM "Contact" ct
      WHERE ct."workspaceId" = ${input.workspaceId}
        AND ct."archivedAt" IS NULL
        AND (
          ct."searchVector" @@ websearch_to_tsquery('simple', ${q})
          OR ct."name" ILIKE ${like}
          OR ct."email" ILIKE ${like}
          OR ct."company" ILIKE ${like}
        )
      ORDER BY ts_rank(ct."searchVector", websearch_to_tsquery('simple', ${q})) DESC,
               ct."name" ASC
      LIMIT ${take}`),
  ]);

  return {
    tasks: taskRows.map((t) => ({
      id: t.id,
      number: t.number,
      key: `${workspace.taskPrefix}-${t.number}`,
      title: t.title,
      priority: t.priority,
      dueAt: t.dueAt ? t.dueAt.toISOString() : null,
      columnName: t.columnName,
      boardId: t.boardId,
      boardName: t.boardName,
      boardSlug: t.boardSlug,
      boardKind: t.boardKind,
    })),
    boards: boardRows,
    contacts: contactRows,
  };
}
