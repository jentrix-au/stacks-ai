-- P1.3 (expand + backfill): merge Customer into Contact (one party table).
-- Customer and Ticket.customerId are NOT dropped here — that happens in a
-- separate contract migration after a verified deploy (UPGRADE-PLAN.md §5).
-- The whole script is idempotent: matching is deterministic, inserts reuse
-- the Customer id as the Contact id and skip existing rows, updates only
-- fill NULLs.

-- Expand
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "contactId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Ticket_contactId_fkey'
  ) THEN
    ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Ticket_contactId_idx" ON "Ticket"("contactId");

-- Backfill
DO $$
DECLARE
  matched_count INTEGER;
  created_count INTEGER;
  external_count INTEGER;
  ticket_count INTEGER;
BEGIN
  -- Deterministic customer → contact mapping: match a live contact in the
  -- same workspace by lower(email) (oldest wins); otherwise map to the
  -- customer's own id (a contact with that id is created below).
  CREATE TEMP TABLE _customer_contact_map ON COMMIT DROP AS
  SELECT
    cu."id" AS customer_id,
    COALESCE(
      (
        SELECT co."id"
        FROM "Contact" co
        WHERE co."workspaceId" = cu."workspaceId"
          AND cu."email" IS NOT NULL
          AND co."email" IS NOT NULL
          AND lower(co."email") = lower(cu."email")
          AND co."archivedAt" IS NULL
        ORDER BY co."createdAt", co."id"
        LIMIT 1
      ),
      cu."id"
    ) AS contact_id
  FROM "Customer" cu;

  SELECT COUNT(*) INTO matched_count
  FROM _customer_contact_map WHERE customer_id <> contact_id;

  -- Create contacts for unmatched customers, reusing the customer id so the
  -- mapping (and any re-run) stays stable. preserves createdAt.
  INSERT INTO "Contact"
    ("id", "workspaceId", "name", "email", "phone", "company", "externalId",
     "createdById", "archivedAt", "createdAt", "updatedAt")
  SELECT
    cu."id", cu."workspaceId", cu."name", cu."email", NULL, cu."company",
    cu."externalId", cu."createdById", cu."archivedAt", cu."createdAt",
    cu."updatedAt"
  FROM "Customer" cu
  JOIN _customer_contact_map m
    ON m.customer_id = cu."id" AND m.contact_id = cu."id"
  ON CONFLICT ("id") DO NOTHING;
  GET DIAGNOSTICS created_count = ROW_COUNT;

  -- Carry externalId onto matched contacts that don't have one yet.
  UPDATE "Contact" co
  SET "externalId" = cu."externalId"
  FROM _customer_contact_map m
  JOIN "Customer" cu ON cu."id" = m.customer_id
  WHERE co."id" = m.contact_id
    AND m.contact_id <> m.customer_id
    AND co."externalId" IS NULL
    AND cu."externalId" IS NOT NULL;
  GET DIAGNOSTICS external_count = ROW_COUNT;

  -- Repoint tickets at the merged contact.
  UPDATE "Ticket" t
  SET "contactId" = m.contact_id
  FROM _customer_contact_map m
  WHERE t."customerId" = m.customer_id
    AND t."contactId" IS NULL;
  GET DIAGNOSTICS ticket_count = ROW_COUNT;

  RAISE NOTICE 'customer_contact_merge: % customers matched to existing contacts, % contacts created, % externalIds carried over, % tickets repointed',
    matched_count, created_count, external_count, ticket_count;
END $$;
