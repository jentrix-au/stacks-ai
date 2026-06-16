-- P2.4 idempotency keys (additive — safe under running builds).

CREATE TABLE "IdempotencyKey" (
    "tokenId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("tokenId","key")
);

CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_tokenId_fkey"
  FOREIGN KEY ("tokenId") REFERENCES "ApiToken"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
