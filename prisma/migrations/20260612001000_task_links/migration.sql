-- P1.2 (expand + backfill): universal TaskLink graph subsuming
-- InitiativeDependency. The old table is NOT dropped here — that happens in a
-- separate contract migration after a verified deploy (UPGRADE-PLAN.md §5).

-- CreateEnum
CREATE TYPE "TaskLinkKind" AS ENUM ('BLOCKS', 'DEPENDS_ON', 'RELATES_TO', 'DUPLICATES');

-- CreateTable
CREATE TABLE "TaskLink" (
    "fromTaskId" TEXT NOT NULL,
    "toTaskId" TEXT NOT NULL,
    "kind" "TaskLinkKind" NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskLink_pkey" PRIMARY KEY ("fromTaskId","toTaskId","kind")
);

-- CreateIndex
CREATE INDEX "TaskLink_toTaskId_idx" ON "TaskLink"("toTaskId");

-- AddForeignKey
ALTER TABLE "TaskLink" ADD CONSTRAINT "TaskLink_fromTaskId_fkey" FOREIGN KEY ("fromTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskLink" ADD CONSTRAINT "TaskLink_toTaskId_fkey" FOREIGN KEY ("toTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskLink" ADD CONSTRAINT "TaskLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: copy InitiativeDependency edges, mapping initiative ids → task
-- ids and RELATED → RELATES_TO. Old rows carry no creator, so attribute them
-- to the from-task's creator. Idempotent via ON CONFLICT DO NOTHING.
INSERT INTO "TaskLink" ("fromTaskId", "toTaskId", "kind", "createdById", "createdAt")
SELECT
  fi."taskId",
  ti."taskId",
  CASE d."kind"
    WHEN 'BLOCKS' THEN 'BLOCKS'::"TaskLinkKind"
    WHEN 'DEPENDS_ON' THEN 'DEPENDS_ON'::"TaskLinkKind"
    ELSE 'RELATES_TO'::"TaskLinkKind"
  END,
  ft."createdById",
  d."createdAt"
FROM "InitiativeDependency" d
JOIN "Initiative" fi ON fi."id" = d."fromId"
JOIN "Initiative" ti ON ti."id" = d."toId"
JOIN "Task" ft ON ft."id" = fi."taskId"
ON CONFLICT ("fromTaskId", "toTaskId", "kind") DO NOTHING;
