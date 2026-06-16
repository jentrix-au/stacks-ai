-- P4.1 agent identity: optional teammate-facing display name + emoji avatar
-- on API tokens. Additive and backward-compatible with the running build.
ALTER TABLE "ApiToken" ADD COLUMN "displayName" TEXT;
ALTER TABLE "ApiToken" ADD COLUMN "emoji" TEXT;
