-- P3.1 Global search: Postgres full-text search.
--
-- Generated (STORED) tsvector columns are maintained by Postgres itself —
-- no triggers, no application writes. Prisma cannot express generated
-- columns, so prisma/schema.prisma declares them as `Unsupported("tsvector")?`
-- and this hand-authored migration owns the actual DDL.
--
-- pg_trgm backs the ILIKE fallback in src/server/queries/search.ts:
-- substring/prefix matches that word-level FTS misses (e.g. "auth" →
-- "authentication", or a partial email).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Task: title weighted A, description B.
ALTER TABLE "Task" ADD COLUMN "searchVector" tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("description", '')), 'B')
) STORED;

CREATE INDEX "Task_searchVector_idx" ON "Task" USING GIN ("searchVector");
CREATE INDEX "Task_title_idx" ON "Task" USING GIN ("title" gin_trgm_ops);

-- Contact: 'simple' config — names, emails, and companies must not be
-- stemmed or stop-worded.
ALTER TABLE "Contact" ADD COLUMN "searchVector" tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
  setweight(to_tsvector('simple', coalesce("email", '')), 'A') ||
  setweight(to_tsvector('simple', coalesce("company", '')), 'B')
) STORED;

CREATE INDEX "Contact_searchVector_idx" ON "Contact" USING GIN ("searchVector");
CREATE INDEX "Contact_name_idx" ON "Contact" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "Contact_email_idx" ON "Contact" USING GIN ("email" gin_trgm_ops);
CREATE INDEX "Contact_company_idx" ON "Contact" USING GIN ("company" gin_trgm_ops);

-- Comment bodies surface their parent task in search results.
ALTER TABLE "Comment" ADD COLUMN "searchVector" tsvector
GENERATED ALWAYS AS (to_tsvector('english', coalesce("body", ''))) STORED;

CREATE INDEX "Comment_searchVector_idx" ON "Comment" USING GIN ("searchVector");
