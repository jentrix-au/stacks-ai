# Deployment

The reference production setup: **Vercel** (app + cron) and **Neon** (Postgres). Production runs at <https://your-domain.com>.

## How the build works

`pnpm build` runs `prisma generate && prisma migrate deploy && next build` — migrations apply during every deploy, against `DIRECT_URL` (the non-pooled connection). A reachable database is therefore required at build time; there is no separate migration step to remember.

## Environment variables

### Required

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled Postgres connection (Neon pooler) — runtime queries |
| `DIRECT_URL` | Direct (non-pooled) connection — migrations |
| `AUTH_SECRET` | Auth.js session encryption (`openssl rand -base64 32`) |
| `AUTH_URL` | Canonical origin, e.g. `https://your-domain.com` |
| `NEXT_PUBLIC_APP_URL` | Public app URL (absolute links in emails, OAuth metadata) |
| `CRON_SECRET` | Bearer secret Vercel cron sends to `/api/cron/*` (`openssl rand -hex 32`) |

### Sign-in providers (at least one)

| Variable | Purpose |
| --- | --- |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth — callback `https://<domain>/api/auth/callback/google`. The Cloud-console consent screen must be **published** (or users added as test users); an unpublished screen surfaces as `invalid_client` / `redirect_uri_mismatch` even with correct credentials |
| `AUTH_RESEND_KEY` / `RESEND_FROM` | Resend — magic-link sign-in + invite/notification email |

### Registration & the first admin

Sign-up is **open by default** on this build: anyone can sign in and gets their own personal workspace, and the **first user on a fresh database becomes the instance admin** (`User.isAdmin`). Set `OPEN_SIGNUP=false` to switch to invite-only, where authenticating creates a new account only for (a) the first-ever user (empty-DB bootstrap), (b) an email with a pending, unexpired workspace invitation, or (c) a match in `SIGNUP_ALLOWLIST`; everyone else is denied (`AccessDenied`, surfaced on the login page) and no magic-link email is sent. Existing users always sign in.

| Variable | Purpose |
| --- | --- |
| `OPEN_SIGNUP` | `true`/unset = open registration (default); `false`/`0`/`no`/`off` = invite-only |
| `SIGNUP_ALLOWLIST` | Invite-only mode only: comma/space-separated full emails (`founder@acme.com`) and/or domain suffixes (`@acme.com`) allowed to self-serve without an invitation |

> **Bootstrapping a fresh deployment:** just sign in — the first user on the empty database is admitted (open mode admits everyone; invite-only still admits the first user) and becomes the admin, then invites everyone else from **Members**. No `SIGNUP_ALLOWLIST` entry is needed to bootstrap.

### Optional services (features no-op without them)

| Variable | Enables |
| --- | --- |
| `PUSHER_APP_ID` / `PUSHER_KEY` / `PUSHER_SECRET` / `PUSHER_CLUSTER` + `NEXT_PUBLIC_PUSHER_KEY` / `NEXT_PUBLIC_PUSHER_CLUSTER` | Live multi-user board sync |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_BASE_URL` | File attachments (Cloudflare R2 or any S3-compatible store) |
| `VOYAGE_API_KEY` (+ optional `STACKS_EMBEDDINGS_MODEL`, default `voyage-3.5-lite`) | Semantic layer: `find_similar_tasks` + duplicate suggestions on bug panels |

**Never set in production**: `STACKS_WEBHOOK_ALLOW_PRIVATE` (disables the webhook SSRF guard — dev-only).

## Cron jobs

`vercel.json` schedules two jobs; Vercel calls them with `Authorization: Bearer $CRON_SECRET`:

| Route | Schedule | Does |
| --- | --- | --- |
| `/api/cron/sweep` | every 5 min | Due-soon/overdue reminders, SLA breach detection, webhook retry drain, idempotency-key TTL cleanup, embedding refresh (new + edited tasks/contacts) |
| `/api/cron/daily-digest` | 08:00 UTC daily | Emails opted-in users their unread notifications from the last 24h |

(`/api/cron/webhooks-retry` still exists for manual runs; the sweep covers it in normal operation.)

After a deploy, hit the sweep once and check the response counters:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/sweep
```

## Post-deploy checklist

1. Sign in via each configured provider.
2. Seed or create a workspace; drag a card in two browser windows to confirm realtime (if Pusher is configured).
3. Mint a PAT and call the MCP endpoint:

   ```bash
   curl -s https://your-domain.com/api/mcp \
     -H "Authorization: Bearer tm_..." -H "content-type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 400
   ```

4. Run the sweep manually (above) — with `VOYAGE_API_KEY` newly set, the first sweeps backfill embeddings in batches; semantic features come alive as it progresses.
5. If using OAuth clients: confirm discovery documents resolve at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`.

## Notes

- **Neon**: use the pooled connection string for `DATABASE_URL` and the direct one for `DIRECT_URL`. If a deploy dies on a stuck `prisma migrate` advisory lock, terminate idle connections holding it and redeploy.
- **Postgres extensions**: migrations enable `pg_trgm` (search) and `vector` (semantic layer) via `CREATE EXTENSION IF NOT EXISTS` — Neon supports both out of the box. Anywhere else (CI service containers, self-hosted, Docker dev) the server must have pgvector installed or the migration fails with `extension "vector" is not available`; the `pgvector/pgvector:pg16` image is a drop-in replacement for `postgres:16`.
- **Custom domain**: set `AUTH_URL` and `NEXT_PUBLIC_APP_URL` to the final domain *before* configuring OAuth providers, and register callback URLs for every origin you actually use (production domain, previews, localhost for dev) — Google rejects mismatches hard.
- The [reference agents](./agents-setup.md#hosting-variants) do **not** deploy to Vercel — run them on an always-on host pointed at the production MCP URL.
