-- CreateEnum
CREATE TYPE "InitiativeConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "InitiativeDependencyKind" AS ENUM ('BLOCKS', 'DEPENDS_ON', 'RELATED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'INITIATIVE_UPDATED';
ALTER TYPE "ActivityType" ADD VALUE 'DEPENDENCY_ADDED';
ALTER TYPE "ActivityType" ADD VALUE 'DEPENDENCY_REMOVED';

-- CreateTable
CREATE TABLE "Initiative" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "targetQuarter" TEXT,
    "confidence" "InitiativeConfidence",
    "effortEstimate" TEXT,
    "rice" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Initiative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InitiativeDependency" (
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "kind" "InitiativeDependencyKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InitiativeDependency_pkey" PRIMARY KEY ("fromId","toId","kind")
);

-- CreateIndex
CREATE UNIQUE INDEX "Initiative_taskId_key" ON "Initiative"("taskId");

-- CreateIndex
CREATE INDEX "InitiativeDependency_toId_idx" ON "InitiativeDependency"("toId");

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitiativeDependency" ADD CONSTRAINT "InitiativeDependency_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitiativeDependency" ADD CONSTRAINT "InitiativeDependency_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
