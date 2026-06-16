# Stacks

**The universal board for AI agents.** One board — tasks, issues, bugs, CRM deals, support tickets, roadmap initiatives — that humans drag around a Kanban UI and AI agents drive through a built-in **MCP server (54 tools)**. Anything a person can do in the UI, an agent can do over MCP — authenticated with scoped tokens or OAuth, rate-limited and idempotent, and attributed as a named teammate in the activity feed.

Open source and self-hostable: bring your own Postgres, run it, and the first person to sign in becomes the admin.

## What it is

- **One surface, five board kinds.** Every board is a Kanban of cards, but its _kind_ shapes them: plain **Tasks**, **Bugs** (severity, version, resolution), **Support** tickets (SLA, contact), **CRM** deals (amount, pipeline stage, contacts), or **Roadmap** initiatives (quarter, RICE). Convert a board between kinds and the cards adapt in place.
- **Agent-native.** The same operations power the UI (Server Actions) and the **MCP server** at `/api/mcp`. Agents authenticate with scoped personal tokens (`read` / `write` / `admin`) or OAuth 2.1, are rate-limited and idempotency-safe, and appear as named teammates in every activity feed and comment thread.
- **Batteries included.** Real-time multi-user sync, labels, assignees, due dates, subtasks, comments + @mentions, attachments, saved views, bulk edit, global full-text + semantic search, dashboards, a dependency roadmap graph, notifications, CSV/Trello import, automations, and signed outbound webhooks.
- **Self-hostable.** Postgres + Next.js, deployable to any Node host. Realtime, file storage, email, and embeddings are optional and degrade gracefully when unconfigured.

## Documentation

Full docs live in [`docs/`](docs/README.md) and render in-app at `/docs`:

| Guide | Covers |
| --- | --- |
| [Getting started](docs/getting-started.md) | Local setup, env vars, seeding, signing in |
| [User guide](docs/user-guide.md) | Boards & kinds, tasks, filters, saved views, bulk edit, search, My Work, inbox, dashboards, import/export |
| [Automations](docs/automations.md) | The rules engine |
| [Webhooks](docs/webhooks.md) | Outbound events + HMAC verification |
| [Agent platform](docs/agent-platform.md) | MCP tokens, scopes, tool catalog, idempotency/concurrency contracts, OAuth 2.1 |
| [Agent setup variants](docs/agents-setup.md) | Claude Code, claude.ai, Codex/ChatGPT, Cursor, custom SDK agents, the bundled [reference agents](agents/README.md) |
| [Deployment](docs/deployment.md) | Vercel + Neon production setup |

## Quick start — let an agent set it up

The fastest path is to hand the setup to a coding agent (Claude Code, Cursor, Codex, …). Paste this prompt and answer its questions as it goes:

```text
Set up and run "Stacks" — an open-source universal board for AI agents
(https://github.com/jentrix-au/stacks-ai) — on my machine.

Do this, explaining each step and pausing whenever you need a credential or a decision
from me:

1. Clone it and cd in:
   git clone https://github.com/jentrix-au/stacks-ai && cd stacks-ai
2. Ensure Node 20+ is available, then run:  corepack enable && pnpm install
3. Database: walk me through creating a free Postgres project at https://neon.tech,
   then ask me to paste the POOLED and DIRECT connection strings.
4. Sign-in: recommend Resend email magic links (have me create a key at
   https://resend.com/api-keys), or Google OAuth
   (https://console.cloud.google.com/apis/credentials) if I prefer. Ask me for the values.
5. Create .env.local from .env.example and fill in DATABASE_URL, DIRECT_URL, the provider
   credentials, and a fresh AUTH_SECRET (generate with: openssl rand -base64 32). Leave the
   optional services (Pusher, Cloudflare R2, Voyage AI) blank — they no-op cleanly.
6. Run:  pnpm db:deploy   (applies migrations to the empty database), then:  pnpm dev
7. Tell me to open http://localhost:3000 and sign in — the first account automatically
   becomes the instance admin.
8. Connect an AI agent over MCP: have me create an access token at
   http://localhost:3000/account/tokens (pick read/write scopes), then wire up my MCP
   client with it. For Claude Code, run:
     claude mcp add --transport http stacks http://localhost:3000/api/mcp \
       --header "Authorization: Bearer <MY_TOKEN>"
   For other clients, add this to their MCP config:
     { "url": "http://localhost:3000/api/mcp",
       "headers": { "Authorization": "Bearer <MY_TOKEN>" } }

Never paste real secrets anywhere except .env.local or my MCP client config.
```

It clones the repo, installs dependencies, walks you through getting a free database and a sign-in key, writes your `.env.local`, runs the migrations, and starts the app. Prefer to do it yourself? Follow the manual steps below.

## Manual setup (self-hosting)

The **first person to sign in on a fresh database becomes the admin**; from there you invite your team.

### Prerequisites

- **Node 20+** (Next.js 16 / React 19) and **pnpm 11** — run `corepack enable` for the pinned version.
- A **Postgres 16+** database (see the table below). Migrations enable the `pgvector` and `pg_trgm` extensions automatically — no manual setup.
- **One sign-in provider** (Resend or Google). Everything else is optional.

### 1. Create the accounts you need

Only the first two rows are required; the rest are optional and no-op cleanly when their env vars are blank.

| Service | Powers | Required? | Sign up |
| --- | --- | --- | --- |
| **Neon** — Postgres | The database | **Yes** | <https://neon.tech> |
| **Resend** — email | Magic-link sign-in + invite/notification email | **A provider** | <https://resend.com> · [API keys](https://resend.com/api-keys) |
| **Google Cloud** — OAuth | Google sign-in (alternative to Resend) | **A provider** | [Credentials console](https://console.cloud.google.com/apis/credentials) |
| **Pusher Channels** | Real-time multi-user board sync | Optional | <https://pusher.com> |
| **Cloudflare R2** | File attachments (S3-compatible) | Optional | <https://dash.cloudflare.com> → R2 |
| **Voyage AI** | Semantic search + duplicate detection | Optional | <https://dashboard.voyageai.com> |
| **Vercel** | Hosting + cron (any Node host also works) | Optional | <https://vercel.com/signup> |

`AUTH_SECRET` (and `CRON_SECRET`, only if you run cron) are generated locally with `openssl` — no account needed.

### 2. Database (Neon)

1. Create a project at <https://neon.tech> → open **Connection Details**.
2. Copy the **pooled** string into `DATABASE_URL` and the **direct** (unpooled) one into `DIRECT_URL`; keep `?sslmode=verify-full&channel_binding=require`.

Any Postgres 16+ works — a local server can use the same value for both URLs.

### 3. Sign-in provider (pick one)

- **Resend (simplest):** create a key at <https://resend.com/api-keys>; set `AUTH_RESEND_KEY` and `RESEND_FROM`. Resend's onboarding sender can email you a link before you verify a domain.
- **Google OAuth:** create a client at <https://console.cloud.google.com/apis/credentials>; add the redirect URI `http://localhost:3000/api/auth/callback/google` (plus your production origin); set `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`; **publish the consent screen** (an unpublished screen surfaces as `invalid_client` / `redirect_uri_mismatch`).

### 4. Configure and run

```bash
git clone https://github.com/jentrix-au/stacks-ai && cd stacks-ai
corepack enable && pnpm install
cp .env.example .env.local
# Edit .env.local: DATABASE_URL, DIRECT_URL, a sign-in provider, and
# AUTH_SECRET — generate one with:  openssl rand -base64 32
pnpm db:deploy        # apply all migrations to the empty database
pnpm dev              # → http://localhost:3000
```

`pnpm db:deploy` applies every migration in order to a brand-new empty database — including the `CREATE EXTENSION IF NOT EXISTS pg_trgm / vector` steps — so there is nothing to set up by hand.

### 5. Become the admin

Sign in with your email (Resend) or Google. Open registration is the default, so your first sign-in creates your account and personal workspace (`OWNER`) and — being the first user on the fresh database — flags you the **instance admin**. Invite teammates from **Members**; each new sign-in gets their own workspace.

Set `OPEN_SIGNUP=false` to switch to **invite-only** later: existing users keep signing in, but new accounts need a pending workspace invitation (or a match in `SIGNUP_ALLOWLIST` — comma/space-separated emails and/or `@domain` suffixes). The first user on an empty DB can always bootstrap.

### Optional services

All of these no-op cleanly when their env vars are absent:

| Service | Enables | Without it |
| --- | --- | --- |
| **Resend** (`AUTH_RESEND_KEY`) | Magic-link sign-in, invite + notification emails | No email sign-in; invites/notifications stay in-app |
| **Pusher** (`PUSHER_*`, `NEXT_PUBLIC_PUSHER_*`) | Real-time board sync | Changes appear on the next refresh |
| **Cloudflare R2** (`R2_*`) | File attachments | Uploads disabled |
| **Voyage AI** (`VOYAGE_API_KEY`) | Semantic search + duplicate suggestions | Those features return empty |
| **Cron** (`CRON_SECRET` + a scheduler) | Due/SLA reminders, daily digest, webhook retries, embedding refresh | Those background jobs don't run |

### Demo data (optional)

`pnpm db:seed` creates a demo workspace and `demo@stacks.local`; in dev you can then use the **dev sign-in** button to log in without configuring a provider.

## Connect an AI agent (MCP)

Stacks exposes the same operations as the UI through a built-in **MCP server**, so any MCP-capable agent can read and write your boards — authenticated, scoped, and attributed in the activity feed.

### 1. Create an access token

Sign in, then open **`/account/tokens`** → **New token**:

- Choose least-privilege **scopes** — `read`, `write`, and/or `admin`.
- Optionally **pin it to one workspace** and give it a **name + emoji** (its actions get badged in the activity feed).
- Copy the `tm_…` token — it's shown only once.

For OAuth-capable clients (below) you can skip this and authorize interactively instead.

### 2. Point your MCP client at the endpoint

The endpoint is `http://localhost:3000/api/mcp` locally (`https://<your-domain>/api/mcp` in production); pass the token as a Bearer header.

**Claude Code**

```bash
claude mcp add --transport http stacks http://localhost:3000/api/mcp \
  --header "Authorization: Bearer tm_..."
```

**Cursor / any Streamable-HTTP MCP client** — add to its MCP config (e.g. `mcp.json`):

```json
{
  "mcpServers": {
    "stacks": {
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer tm_..." }
    }
  }
}
```

**claude.ai / Claude Desktop** — add a custom connector pointing at the `/api/mcp` URL and sign in through the built-in **OAuth** consent screen (pick scopes + workspace; no token to copy-paste).

The agent now has every Stacks tool (`mcp__stacks__*`), plus resources and prompts. Full client-by-client guide and the platform contracts (scopes, idempotency, concurrency, error hints): [docs/agents-setup.md](docs/agents-setup.md) and [docs/agent-platform.md](docs/agent-platform.md).

## Stack

- **Next.js 16** (App Router, React 19, Server Actions) on **Vercel**
- **Prisma 7** + **Postgres** (Neon in prod, `pg` adapter)
- **Auth.js v5** with database sessions — Google OAuth and Resend magic links
- **Pusher Channels** for real-time board sync
- **Cloudflare R2** (S3-compatible) for file attachments
- **Resend** for invite + magic-link email
- **dnd-kit** for drag-and-drop, **Tailwind v4** + **shadcn/ui** (base-ui primitives) for the UI
- **MCP** via `mcp-handler` at `/api/[transport]`, authed by Bearer PAT

## Scripts

| Command            | What it does                                                |
| ------------------ | ----------------------------------------------------------- |
| `pnpm dev`         | Next dev server on :3000                                    |
| `pnpm build`       | `prisma generate && prisma migrate deploy && next build`    |
| `pnpm typecheck`   | `tsc --noEmit`                                              |
| `pnpm lint`        | ESLint (Next + TS + Prettier)                               |
| `pnpm format`      | Prettier (with the tailwindcss class-sort plugin)           |
| `pnpm test`        | Vitest                                                      |
| `pnpm test:e2e`    | Playwright; auto-starts `pnpm dev --port 3100`              |
| `pnpm db:migrate`  | Create + apply a dev migration                              |
| `pnpm db:deploy`   | Apply pending migrations (CI / prod)                        |
| `pnpm db:push`     | Push schema without a migration (prototyping)               |
| `pnpm db:studio`   | Prisma Studio                                               |
| `pnpm db:seed`     | Idempotent demo workspace + `demo@stacks.local` user        |

## Project layout

```
src/
  app/
    (auth)/                       login, callbacks
    [workspaceSlug]/              board, members, settings (App Router pages)
    api/
      [transport]/route.ts        MCP server (Streamable HTTP)
      auth/                       Auth.js handlers
      dev/sign-in/                dev-only e2e auth shortcut
      pusher/                     channel auth
      uploads/                    R2 presigned-URL endpoints
  auth.ts, auth.config.ts         Auth.js v5 (Node + Edge-safe split)
  components/
    board/                        board client, columns, task panel, dnd
    workspace/                    members, invites, switcher
    ui/                           shadcn primitives
  hooks/use-board-realtime.ts     Pusher subscription
  lib/
    db.ts                         lazy Prisma singleton
    authz.ts                      requireWorkspaceRole / requireBoardAccess / requireTaskAccess
    position.ts                   fractional ordering helpers
    pusher-server.ts              triggerBoardEvent + channel auth
    api-tokens.ts                 PAT hashing + verification
    rate-limit.ts                 per-token rate limits
    mcp/tools.ts                  MCP tool registration
    enums.ts                      client-safe mirrors of Prisma enums
  server/
    actions/                      Server Actions (UI entry points)
    queries/                      read helpers (React-cached)
    tasks/operations.ts           shared mutation core (UI + MCP)
    tasks/schemas.ts              Zod schemas reused by UI + MCP
prisma/
  schema.prisma                   Workspace → Board → Column → Task data model
  migrations/                     migration history
  seed.ts                         demo workspace seed
```

## How it fits together

### Mutations

Every task mutation goes through `src/server/tasks/operations.ts`. Each op:

1. Checks authorization via `requireWorkspaceRole` / `requireBoardAccess` / `requireTaskAccess` (throws `AuthzError` → 403/404).
2. Writes in a `db.$transaction` alongside an `Activity` row.
3. Calls `revalidatePath` for the affected board route.
4. Fires a typed Pusher event so other clients refresh.

`src/server/actions/*` (UI Server Actions) and `src/lib/mcp/tools.ts` (MCP) both call the same `ops.*` functions with the same Zod schemas from `src/server/tasks/schemas.ts`. Each op accepts `source: "ui" | "mcp"` to tag activity correctly.

### Ordering

Columns, tasks, and subtasks are ordered by a fractional `Float` `position`. Inserts pick the midpoint between neighbors (`POSITION_STEP = 1024`); when gaps collapse, call `rebalance()` from `src/lib/position.ts`. Don't use integer indices for ordering.

### Realtime

`emitBoardEvent(boardId, event, payload)` is the single fan-out: it publishes on `private-board-${boardId}` (Pusher) and enqueues outbound webhook deliveries. The client hook `useBoardRealtime` applies fine-grained patches for sidecar updates and falls back to `router.refresh()` for everything else.

### MCP access

Users create scoped personal access tokens (`tm_…`) from `/account/tokens`; OAuth 2.1 access tokens (`tmo_…`) are issued by the built-in authorization server. The MCP endpoint at `/api/[transport]` is mounted via `mcp-handler` and authenticates each request with `Authorization: Bearer <token>` against `ApiToken.tokenHash` (sha256, constant-time compare). Per-token rate limits live in `ApiTokenRateLimit`. See [docs/agent-platform.md](docs/agent-platform.md) for the full reference.

## Conventions

- Path alias: `@/*` → `src/*`.
- **Don't import enum values from `@prisma/client` in Client Components** — it pulls the Prisma browser shim into the bundle. Use the mirror constants in `src/lib/enums.ts` instead.
- shadcn here wraps **base-ui**, not Radix. `DropdownMenuItem` uses `onClick`, not `onSelect` (the latter silently no-ops).
- Prettier: 2-space, double quotes, trailing commas, 80 cols.
- E2E auth: tests POST to `/api/dev/sign-in` (dev-only endpoint) to log in as the seeded demo user.

## Deployment

Any Node host works (`pnpm build && pnpm start`); **Vercel + Neon** is the reference setup.

- `pnpm build` runs `prisma generate && prisma migrate deploy && next build`, so each deploy applies pending migrations against `DIRECT_URL` (clean on a brand-new empty database).
- Set every env var from your `.env.local` on the host, plus `AUTH_URL` and `NEXT_PUBLIC_APP_URL` = your public origin.

### Background jobs (cron)

Two endpoints do the recurring work — due/SLA reminders, the daily digest, webhook retries, and embedding refresh. Both require the header `Authorization: Bearer $CRON_SECRET` (set `CRON_SECRET` to a random value: `openssl rand -hex 32`).

| Endpoint | Schedule |
| --- | --- |
| `/api/cron/sweep` | every 5 min |
| `/api/cron/daily-digest` | daily, 08:00 UTC |

**On Vercel** — the schedules already ship in [`vercel.json`](vercel.json):

```json
{
  "crons": [
    { "path": "/api/cron/sweep", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/daily-digest", "schedule": "0 8 * * *" }
  ]
}
```

Just add a **`CRON_SECRET`** environment variable in your Vercel project — Vercel automatically sends it as the `Authorization: Bearer` header when it triggers these paths, and the routes reject anything else. Cron is picked up on deploy; nothing else to configure. (Sub-daily schedules like `*/5` need a Vercel **Pro** plan; on Hobby, set `sweep` to run daily or drive it from an external scheduler.)

**Anywhere else** — point any scheduler (system `cron`, GitHub Actions, Upstash/EasyCron, …) at the two URLs with the bearer header:

```cron
*/5 * * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/sweep
0   8 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/daily-digest
```

Without a scheduler the app still runs — those background jobs just don't fire.
