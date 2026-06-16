# Stacks reference agents

Three small agents that operate Stacks **exclusively through its MCP server** — the same tool surface, auth, and contracts any third-party agent gets. They exist to dogfood the agent platform end-to-end (P4.2) and double as living documentation: if a platform contract breaks, these break.

They run on either of two interchangeable runtimes (same prompts, same MCP server, same attribution badges — the platform is runtime-neutral):

| `STACKS_AGENT_PROVIDER` | Runtime | Auth |
| --- | --- | --- |
| `claude` (default) | [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/typescript) | `ANTHROPIC_API_KEY` |
| `codex` | [OpenAI Codex SDK](https://developers.openai.com/codex/sdk) | `codex login` — your **ChatGPT subscription**, no API key |

The Codex runtime injects the Stacks MCP server per-run via config overrides (your `~/.codex/config.toml` is never edited) and runs with the shell tool disabled and a read-only sandbox, so both runtimes see the same world: Stacks tools only.

This is a **standalone package** — it is not part of the app's dependency tree, build, or CI. Install and run it separately:

```bash
cd agents
pnpm install
cp .env.example .env   # fill in STACKS_TOKEN (+ ANTHROPIC_API_KEY, or set STACKS_AGENT_PROVIDER=codex)
```

`tsx` loads nothing automatically — export the env vars (`set -a; source .env; set +a`) or run via `node --env-file=.env --import tsx <agent>.ts`.

## Setup: mint a token

On `/account/tokens`, create a PAT per agent with least privilege:

| Agent | Scopes | Identity suggestion |
| --- | --- | --- |
| `standup` | `read` | 📋 Standup Bot |
| `bug-triage` | `read`, `write` | 🐛 Triage Bot |
| `crm-follow-up` | `read`, `write` | 🤝 Follow-up Bot |

Pin each token to one workspace, and set the **agent display name + emoji** — every action the agent takes is then badged with that identity in activity feeds and comments (P4.1), and `/account/tokens` shows its daily usage (P2.8).

## The agents

### `pnpm bug-triage` — webhook-driven triage (long-running server)

Closes the full agent loop: **webhook out → agent → MCP tools in**.

1. In workspace settings, create a webhook for `task.created` pointing at this server (default `:8787`; use a tunnel for a deployed Stacks). Put its secret in `STACKS_WEBHOOK_SECRET`.
2. The receiver verifies the HMAC signature (`X-Stacks-Signature`, timestamp-bound — the exact scheme documented in CLAUDE.md §P2.6), acks fast, and queues one agent run per created task.
3. The agent: `get_task` → skips non-BUGS tasks → infers and sets severity (`update_bug_report`) → searches for duplicates (`search_tasks`, P3.1) and links them (`add_task_link` `DUPLICATES`/`RELATES_TO`, P1.2) → asks for repro steps in a comment when missing.

Webhook retries can redeliver — the comment uses an `idempotencyKey` derived from the delivery id (P2.4), so a retry replays instead of double-commenting.

### `pnpm crm-follow-up` — scheduled pipeline sweep (cron)

Walks CRM boards via `get_board_snapshot`, finds deals with a close date within 7 days (or past) and no *human* activity in 72h (`list_activity` with the `source` filter), and posts a clearly-marked **draft** follow-up comment on up to 5 deals — the human stays in the loop and sends the actual email. Idempotency keys are stable per deal per day, so re-running the cron never duplicates drafts.

```cron
0 7 * * *  cd /path/to/agents && pnpm crm-follow-up
```

### `pnpm standup` — daily digest (cron, read-only)

Diffs the last 24h of `list_activity`, querying humans (`source: "ui"`) and agents (`source: "mcp"`) separately, and emits a short markdown digest — stdout by default, Slack when `SLACK_WEBHOOK_URL` is set. Runs safely on a `read`-only token: the server rejects any mutation it could be talked into.

```cron
0 8 * * 1-5  cd /path/to/agents && pnpm standup
```

## Platform features these exercise

| Feature | Where |
| --- | --- |
| Scoped PATs + workspace pinning (P2.1) | all three (least-privilege table above) |
| Structured `{ error: { code, hint } }` envelopes (P0.4) | system prompts tell the agent to follow hints |
| Idempotency keys (P2.4) | bug-triage (per delivery), crm-follow-up (per deal/day) |
| Orientation + search tools (P2.3, P3.1) | `get_board_snapshot`, `search_tasks` |
| Cross-kind task links (P1.2) | bug-triage duplicate detection |
| Outbound webhooks + HMAC (P2.6) | bug-triage receiver |
| Activity source attribution (P2.8) | standup + crm-follow-up `source` filters |
| Agent identity badges (P4.1) | token displayName/emoji on every mutation |

## Sanity check

`pnpm typecheck` type-checks the package. For a live smoke test, point `.env` at a dev server (`pnpm dev` in the repo root, seeded via `pnpm db:seed`), mint a token with the dev helper, and run `pnpm standup`:

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/dev/mcp-token \
  -H 'content-type: application/json' \
  -d '{"name":"standup dev","displayName":"Standup Bot","emoji":"📋"}' | jq -r .token)
STACKS_TOKEN=$TOKEN pnpm standup                              # Claude runtime
STACKS_TOKEN=$TOKEN STACKS_AGENT_PROVIDER=codex pnpm standup  # ChatGPT subscription
```
