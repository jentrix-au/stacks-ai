-- P1.1: Workspace.taskPrefix + WorkspaceCounter + Task.workspaceId/number.
-- Expand → backfill → constrain, all additive (no drops). Hand-written because
-- the generated migration cannot add required columns to populated tables.

-- AlterTable: Workspace.taskPrefix (nullable first, backfill from slug, then NOT NULL)
ALTER TABLE "Workspace" ADD COLUMN "taskPrefix" TEXT;

-- Mirror of taskPrefixFromSlug() in src/lib/slug.ts: strip non-alphanumerics,
-- uppercase, take the first 3 chars; fall back to 'WS' for degenerate slugs.
UPDATE "Workspace"
SET "taskPrefix" = COALESCE(
  NULLIF(upper(left(regexp_replace("slug", '[^a-zA-Z0-9]', '', 'g'), 3)), ''),
  'WS'
)
WHERE "taskPrefix" IS NULL;

ALTER TABLE "Workspace" ALTER COLUMN "taskPrefix" SET NOT NULL;

-- CreateTable: WorkspaceCounter
CREATE TABLE "WorkspaceCounter" (
    "workspaceId" TEXT NOT NULL,
    "nextTaskNumber" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "WorkspaceCounter_pkey" PRIMARY KEY ("workspaceId")
);

-- AddForeignKey
ALTER TABLE "WorkspaceCounter" ADD CONSTRAINT "WorkspaceCounter_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Task.workspaceId + Task.number (nullable first)
ALTER TABLE "Task" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Task" ADD COLUMN "number" INTEGER;

-- Backfill workspaceId from column.board.workspaceId in batches of 1000 so a
-- large Task table doesn't hold one long row lock (§5 of UPGRADE-PLAN.md).
DO $$
DECLARE
  rows_updated INTEGER;
BEGIN
  LOOP
    UPDATE "Task" t
    SET "workspaceId" = b."workspaceId"
    FROM "Column" c
    JOIN "Board" b ON b."id" = c."boardId"
    WHERE t."columnId" = c."id"
      AND t."id" IN (
        SELECT "id" FROM "Task" WHERE "workspaceId" IS NULL LIMIT 1000
      );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
  END LOOP;
END $$;

-- Backfill numbers per workspace in createdAt order (id as tiebreaker).
WITH numbered AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "workspaceId" ORDER BY "createdAt", "id"
         ) AS n
  FROM "Task"
  WHERE "number" IS NULL
)
UPDATE "Task" t
SET "number" = numbered.n
FROM numbered
WHERE t."id" = numbered."id";

-- Constrain
ALTER TABLE "Task" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "number" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "Task_workspaceId_number_key" ON "Task"("workspaceId", "number");

-- Seed counters so the next allocated number continues after the backfill.
INSERT INTO "WorkspaceCounter" ("workspaceId", "nextTaskNumber")
SELECT w."id", COALESCE(MAX(t."number"), 0) + 1
FROM "Workspace" w
LEFT JOIN "Task" t ON t."workspaceId" = w."id"
GROUP BY w."id"
ON CONFLICT ("workspaceId") DO NOTHING;
