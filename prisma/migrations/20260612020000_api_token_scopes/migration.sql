-- P2.1 Scoped tokens (additive — safe while older builds are running).
-- scopes: least-privilege classes "read" | "write" | "admin". Existing rows
-- keep the empty-array default and are treated as grandfathered full access
-- until rotated (enforced in src/lib/token-scopes.ts, nagged in the UI).
-- workspaceId: null = all the user's workspaces; set = single-workspace token.

ALTER TABLE "ApiToken" ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ApiToken" ADD COLUMN "workspaceId" TEXT;

ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ApiToken_workspaceId_idx" ON "ApiToken"("workspaceId");
