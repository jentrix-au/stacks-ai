-- Contract step for P1.2 + P1.3 (user-confirmed 2026-06-12): drop the
-- superseded tables now that nothing reads or writes them.
--   * InitiativeDependency rows were copied into TaskLink (task_links
--     migration); Customer rows were merged into Contact and tickets
--     repointed to Ticket.contactId (customer_contact_merge migration).
--   * DEPLOY ORDER MATTERS: this migration must only run once a build that
--     no longer references these tables is live (UPGRADE-PLAN.md §5) —
--     deploy the Phase 1 code first, verify, then deploy this.

-- P1.2 contract: InitiativeDependency → TaskLink
DROP TABLE IF EXISTS "InitiativeDependency";
DROP TYPE IF EXISTS "InitiativeDependencyKind";

-- P1.3 contract: Customer → Contact
ALTER TABLE "Ticket" DROP CONSTRAINT IF EXISTS "Ticket_customerId_fkey";
DROP INDEX IF EXISTS "Ticket_customerId_idx";
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "customerId";
DROP TABLE IF EXISTS "Customer";
