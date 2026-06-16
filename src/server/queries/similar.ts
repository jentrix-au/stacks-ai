import { Prisma, type BoardKind } from "@prisma/client";

import { db } from "@/lib/db";
import {
  AuthzError,
  requireTaskAccess,
  requireWorkspaceRole,
} from "@/lib/authz";
import { embedTexts, embeddingsEnabled, vectorLiteral } from "@/lib/embeddings";

/**
 * P4.3 semantic similarity — the one pgvector query layer powering the
 * find_similar_tasks MCP tool and the duplicate-bug suggestions in the task
 * detail panel. Exact KNN by cosine distance over Task.embedding (no ANN
 * index at current scale — see the P4.3 migration comment).
 *
 * Embeddings are swept every 5 minutes, so a just-created task may not be
 * findable yet; callers surface that as a notice, never an error.
 */

export interface SimilarTask {
  id: string;
  number: number;
  key: string;
  title: string;
  columnName: string;
  boardId: string;
  boardName: string;
  boardSlug: string;
  boardKind: BoardKind;
  /** Cosine similarity in [0, 1] (1 = identical direction), rounded to 4dp. */
  similarity: number;
}

/** Suggestions below this similarity are noise, not duplicate candidates. */
export const DUPLICATE_SUGGESTION_THRESHOLD = 0.8;

const SIMILAR_SELECT_SQL = Prisma.sql`
  SELECT t."id", t."number", t."title",
         w."taskPrefix" AS "taskPrefix",
         c."name" AS "columnName",
         b."id" AS "boardId", b."name" AS "boardName",
         b."slug" AS "boardSlug", b."kind" AS "boardKind"`;

const SIMILAR_JOIN_SQL = Prisma.sql`
  JOIN "Column" c ON c."id" = t."columnId"
  JOIN "Board" b ON b."id" = c."boardId"
  JOIN "Workspace" w ON w."id" = t."workspaceId"`;

const OPEN_TASK_SQL = Prisma.sql`
  t."archivedAt" IS NULL AND c."archivedAt" IS NULL AND b."archivedAt" IS NULL
  AND t."embedding" IS NOT NULL`;

interface SimilarRow {
  id: string;
  number: number;
  title: string;
  taskPrefix: string;
  columnName: string;
  boardId: string;
  boardName: string;
  boardSlug: string;
  boardKind: BoardKind;
  distance: number;
}

function toSimilarTask(row: SimilarRow): SimilarTask {
  return {
    id: row.id,
    number: row.number,
    key: `${row.taskPrefix}-${row.number}`,
    title: row.title,
    columnName: row.columnName,
    boardId: row.boardId,
    boardName: row.boardName,
    boardSlug: row.boardSlug,
    boardKind: row.boardKind,
    similarity: Math.round((1 - row.distance) * 10_000) / 10_000,
  };
}

export interface SimilarResult {
  tasks: SimilarTask[];
  /** Set when results may be incomplete (provider off, source unembedded). */
  notice?: string;
}

const DISABLED_NOTICE =
  "Semantic search is not configured (no embeddings provider key) — use search_tasks for keyword search.";

/**
 * Tasks semantically similar to an existing task, using its STORED embedding
 * (no provider call). Workspace-scoped via the source task; archived
 * excluded; optionally hides tasks already linked to the source.
 */
export async function findSimilarToTask(
  userId: string,
  input: { taskId: string; limit?: number; excludeLinked?: boolean },
): Promise<SimilarResult> {
  await requireTaskAccess(userId, input.taskId);
  if (!embeddingsEnabled()) return { tasks: [], notice: DISABLED_NOTICE };
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);

  const excludeLinkedSql = input.excludeLinked
    ? Prisma.sql`AND NOT EXISTS (
        SELECT 1 FROM "TaskLink" l
        WHERE (l."fromTaskId" = src."id" AND l."toTaskId" = t."id")
           OR (l."fromTaskId" = t."id" AND l."toTaskId" = src."id"))`
    : Prisma.empty;

  const rows = await db.$queryRaw<SimilarRow[]>(Prisma.sql`
    ${SIMILAR_SELECT_SQL},
           (t."embedding" <=> src."embedding")::float8 AS "distance"
    FROM "Task" src
    JOIN "Task" t ON t."workspaceId" = src."workspaceId" AND t."id" <> src."id"
    ${SIMILAR_JOIN_SQL}
    WHERE src."id" = ${input.taskId}
      AND src."embedding" IS NOT NULL
      AND ${OPEN_TASK_SQL}
      ${excludeLinkedSql}
    ORDER BY t."embedding" <=> src."embedding" ASC, t."id" ASC
    LIMIT ${limit}`);

  if (rows.length === 0) {
    // Distinguish "nothing similar" from "source not embedded yet".
    const [src] = await db.$queryRaw<{ embedded: boolean }[]>(Prisma.sql`
      SELECT ("embedding" IS NOT NULL) AS "embedded"
      FROM "Task" WHERE "id" = ${input.taskId}`);
    if (src && !src.embedded) {
      return {
        tasks: [],
        notice:
          "This task has no embedding yet — embeddings are generated every ~5 minutes. Retry shortly.",
      };
    }
  }
  return { tasks: rows.map(toSimilarTask) };
}

/**
 * Tasks semantically similar to free text (the query is embedded at call
 * time with input_type "query"). Workspace membership checked first.
 */
export async function findSimilarToQuery(
  userId: string,
  input: { workspaceId: string; query: string; limit?: number },
): Promise<SimilarResult> {
  await requireWorkspaceRole(userId, input.workspaceId);
  const q = input.query.trim();
  if (!q) throw new AuthzError("query must not be empty", 400);
  if (!embeddingsEnabled()) return { tasks: [], notice: DISABLED_NOTICE };
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);

  const [vector] = await embedTexts([q.slice(0, 8000)], "query");
  const literal = vectorLiteral(vector);

  const rows = await db.$queryRaw<SimilarRow[]>(Prisma.sql`
    ${SIMILAR_SELECT_SQL},
           (t."embedding" <=> ${literal}::vector)::float8 AS "distance"
    FROM "Task" t
    ${SIMILAR_JOIN_SQL}
    WHERE t."workspaceId" = ${input.workspaceId}
      AND ${OPEN_TASK_SQL}
    ORDER BY t."embedding" <=> ${literal}::vector ASC, t."id" ASC
    LIMIT ${limit}`);

  return { tasks: rows.map(toSimilarTask) };
}

/**
 * Duplicate candidates for the detail panel (P4.3): high-similarity
 * neighbors not already linked to the task. Returns [] when the provider is
 * off — the UI section simply doesn't render.
 */
export async function findDuplicateSuggestions(
  userId: string,
  taskId: string,
): Promise<SimilarTask[]> {
  if (!embeddingsEnabled()) return [];
  const { tasks } = await findSimilarToTask(userId, {
    taskId,
    limit: 5,
    excludeLinked: true,
  });
  return tasks.filter((t) => t.similarity >= DUPLICATE_SUGGESTION_THRESHOLD);
}
