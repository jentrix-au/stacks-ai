-- Move Deal → Contact from a single nullable FK to a DealContact many-to-many.

-- 1. Create the join table.
CREATE TABLE "DealContact" (
    "dealId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealContact_pkey" PRIMARY KEY ("dealId","contactId")
);

CREATE INDEX "DealContact_contactId_idx" ON "DealContact"("contactId");

ALTER TABLE "DealContact" ADD CONSTRAINT "DealContact_dealId_fkey"
    FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DealContact" ADD CONSTRAINT "DealContact_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Backfill: copy each existing Deal.contactId into DealContact.
INSERT INTO "DealContact" ("dealId", "contactId", "createdAt")
SELECT "id", "contactId", COALESCE("updatedAt", CURRENT_TIMESTAMP)
FROM "Deal"
WHERE "contactId" IS NOT NULL;

-- 3. Drop the old singleton column + its index/FK.
ALTER TABLE "Deal" DROP CONSTRAINT "Deal_contactId_fkey";
DROP INDEX "Deal_contactId_idx";
ALTER TABLE "Deal" DROP COLUMN "contactId";
