-- CreateEnum
CREATE TYPE "BugSeverity" AS ENUM ('TRIVIAL', 'MINOR', 'MAJOR', 'CRITICAL', 'BLOCKER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'BUG_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE 'BUG_RESOLVED';
ALTER TYPE "ActivityType" ADD VALUE 'BUG_REOPENED';

-- CreateTable
CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "severity" "BugSeverity",
    "reproSteps" TEXT,
    "expectedBehavior" TEXT,
    "actualBehavior" TEXT,
    "affectedVersion" TEXT,
    "environment" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BugReport_taskId_key" ON "BugReport"("taskId");

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
