# Getting started

Run Stacks locally in about five minutes.

## Prerequisites

- **Node.js 20+** and **pnpm** (the workspace pins pnpm — `corepack enable` is the easiest way to get the right version)
- **Postgres with the `pgvector` extension** — a free [Neon](https://neon.tech) database works great (pgvector is built in); for local/Docker Postgres use an image that ships it, e.g. `pgvector/pgvector:pg16` (the stock `postgres` image fails the semantic-embeddings migration with `extension "vector" is not available`)

## Install and run

```bash
pnpm install
cp .env.example .env.local        # fill in DATABASE_URL + DIRECT_URL (and a sign-in provider)
pnpm db:deploy                    # apply migrations to your (empty) DB
pnpm db:seed                      # optional: idempotent demo workspace + demo user
pnpm dev                          # http://localhost:3000
```

`DATABASE_URL` is the only requirement to boot; browser sign-in also needs `AUTH_SECRET` and one
provider (below). Everything else degrades gracefully:

| Service | Env vars | Without them |
| --- | --- | --- |
| Realtime sync | `PUSHER_*`, `NEXT_PUBLIC_PUSHER_*` | Boards work; other users' changes appear on refresh |
| File attachments | `R2_*` | Attachment upload is unavailable |
| Email (magic links, invites, notifications) | `AUTH_RESEND_KEY`, `RESEND_FROM` | Emails silently no-op |
| Google sign-in | `AUTH_GOOGLE_*` | The Google button doesn't work |
| Semantic search & duplicate detection | `VOYAGE_API_KEY` | `find_similar_tasks` returns empty with a notice; no duplicate suggestions |

## Signing in locally

Auth.js needs at least one working provider for browser sign-in. Pick one:

- **Resend magic links** (simplest): set `AUTH_RESEND_KEY` and `RESEND_FROM`.
- **Google OAuth client**: callback `http://localhost:3000/api/auth/callback/google`, set `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`. Note: the Google Cloud consent screen must be published (or your account added as a test user), or Google rejects the flow.

On first sign-in a personal workspace is created for you automatically. The seed also creates a `demo@stacks.local` user with a fully populated demo workspace (`/demo`) — the e2e suite signs in as it through the dev-only `POST /api/dev/sign-in` endpoint.

**Sign-up is open by default**, and the first user to sign in on a fresh database becomes the instance admin. Set `OPEN_SIGNUP=false` for invite-only, where a new account is created only for the first-ever user (bootstrap), an address with a pending workspace invitation, or a match in `SIGNUP_ALLOWLIST` (comma/space-separated full emails and/or `@domain` suffixes). Existing users always sign in; for a zero-config local login use the dev sign-in button (the seeded `demo@stacks.local`).

## Everyday scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next dev server on :3000 |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` / `pnpm lint:fix` | ESLint |
| `pnpm format` | Prettier |
| `pnpm test` | Vitest unit tests (single test: `pnpm test path/to/file.test.ts -t "name"`) |
| `pnpm test:e2e` | Playwright (auto-starts a dev server on :3100; re-run `pnpm db:seed` first for a clean slate) |
| `pnpm db:migrate` | Create + apply a dev migration |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:seed` | Re-seed the demo workspace (idempotent) |

## Trying the agent platform locally

1. Start the dev server and sign in.
2. Mint a PAT at `/account/tokens` — or, for scripts/tests, use the dev-only helper:

   ```bash
   TOKEN=$(curl -s -X POST localhost:3000/api/dev/mcp-token \
     -H 'content-type: application/json' \
     -d '{"name":"dev token","displayName":"Dev Bot","emoji":"🧪"}' | jq -r .token)
   ```

3. Point any MCP client at `http://localhost:3000/api/mcp` with header `Authorization: Bearer $TOKEN`. See [Agent setup variants](./agents-setup.md) for client-by-client instructions.

## Where to go next

- [User guide](./user-guide.md) — the full feature tour
- [Agent platform](./agent-platform.md) — tokens, scopes, and the MCP tool catalog
- [Deployment](./deployment.md) — taking it to production
