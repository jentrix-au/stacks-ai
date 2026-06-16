-- P3.6 cron sweep: SLA_BREACHED activity (appended at the END of the enum —
-- Postgres enums are append-only) and nullable Activity.actorId so
-- system-generated activities don't impersonate a user.

-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'SLA_BREACHED';

-- AlterTable
ALTER TABLE "Activity" ALTER COLUMN "actorId" DROP NOT NULL;
