-- P4.3 semantic layer: pgvector embeddings on Task and Contact.
--
-- Columns are written by the cron sweep through raw SQL (Prisma can't
-- read/write `vector`); `embeddingHash` stores the md5 of the embedded text
-- so the sweep can find new AND stale rows with one SQL predicate — no
-- triggers, no write-path hooks. Rows embed within one sweep cycle (~5 min).
--
-- No ANN index on purpose: exact KNN over a few thousand rows is
-- milliseconds, and Prisma cannot declare HNSW/IVFFlat indexes in the
-- schema, so an index here would read as drift to `migrate diff`. Add one
-- manually if workspaces grow past ~100k embedded rows.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "Task" ADD COLUMN "embedding" vector(1024);
ALTER TABLE "Task" ADD COLUMN "embeddingHash" TEXT;

ALTER TABLE "Contact" ADD COLUMN "embedding" vector(1024);
ALTER TABLE "Contact" ADD COLUMN "embeddingHash" TEXT;
