-- P2.8 per-token daily usage rollup (additive).

CREATE TABLE "ApiTokenUsage" (
    "tokenId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "mutations" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ApiTokenUsage_pkey" PRIMARY KEY ("tokenId","day")
);

ALTER TABLE "ApiTokenUsage" ADD CONSTRAINT "ApiTokenUsage_tokenId_fkey"
  FOREIGN KEY ("tokenId") REFERENCES "ApiToken"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
