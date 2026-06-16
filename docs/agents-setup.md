# Agent setup variants

Every way to put an agent on your Stacks boards, from "connect an existing AI client in one minute" to "run the bundled autonomous agents on a server". All variants speak to the same [MCP endpoint](./agent-platform.md) and get the same tools, scopes, and attribution.

**Before any variant**: mint a token at `/account/tokens` with least-privilege scopes, pin it to one workspace, and give it a display name + emoji so its actions are badged in the UI. For local dev, the endpoint is `http://localhost:3000/api/mcp`; in production it's `https://your-domain.com/api/mcp`.

| Variant | Best for | Auth |
| --- | --- | --- |
| [Claude Code](#variant-1-claude-code) | Working boards from your terminal/IDE sessions | PAT |
| [claude.ai / Claude Desktop](#variant-2-claudeai--claude-desktop-oauth) | Chat-driven board work, no token handling | OAuth (built-in) |
| [Codex CLI / ChatGPT subscription](#variant-3-codex-cli--chatgpt-subscription) | OpenAI-side equivalent of the above | PAT |
| [Cursor and other MCP clients](#variant-4-cursor-and-other-mcp-clients) | Any client that speaks Streamable HTTP MCP | PAT |
| [Your own agent (SDKs)](#variant-5-build-your-own-agent) | Custom autonomous behavior | PAT |
| [Bundled reference agents](#the-bundled-reference-agents) | Ready-made triage / CRM / standup bots | PAT |

---

## Variant 1: Claude Code

```bash
claude mcp add --transport http stacks https://your-domain.com/api/mcp \
  --header "Authorization: Bearer tm_..."
```

Claude Code then has every Stacks tool (`mcp__stacks__*`), the resources, and the prompts. Try: *"Give me a snapshot of the bugs board and triage anything without a severity."*

## Variant 2: claude.ai / Claude Desktop (OAuth)

Add a custom connector pointing at `https://your-domain.com/api/mcp`. The client discovers the built-in OAuth server automatically; you'll land on a Stacks consent screen where **you choose the scopes and the workspace** the client gets — no token copy-pasting. The client's name becomes its agent badge in activity feeds.

This works for any OAuth-capable remote MCP client, not just Anthropic's — Stacks implements standard discovery (RFC 9728 + 8414) and authorization code + PKCE.

## Variant 3: Codex CLI / ChatGPT subscription

Runs on your ChatGPT plan via `codex login` — no OpenAI API key. Add to `~/.codex/config.toml`:

```toml
[mcp_servers.stacks]
url = "https://your-domain.com/api/mcp"
bearer_token_env_var = "STACKS_TOKEN"
```

Then export `STACKS_TOKEN=tm_...` before running `codex`. (The bundled reference agents can also run on this runtime — see below.)

## Variant 4: Cursor and other MCP clients

Any client supporting Streamable HTTP MCP with custom headers works. The common JSON shape:

```json
{
  "mcpServers": {
    "stacks": {
      "url": "https://your-domain.com/api/mcp",
      "headers": { "Authorization": "Bearer tm_..." }
    }
  }
}
```

## Variant 5: Build your own agent

With the **Claude Agent SDK** (the pattern used by the bundled agents in `agents/lib/providers/claude.ts`):

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Summarize yesterday's board activity, humans vs agents.",
  options: {
    mcpServers: {
      stacks: {
        type: "http",
        url: "https://your-domain.com/api/mcp",
        headers: { Authorization: `Bearer ${process.env.STACKS_TOKEN}` },
      },
    },
    allowedTools: ["mcp__stacks__*"], // Stacks tools only — no filesystem, no shell
  },
})) {
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
}
```

Or any MCP-capable framework — the platform contracts your agent should lean on are documented in the [agent platform reference](./agent-platform.md): structured error hints, `idempotencyKey` on creates, `expectedUpdatedAt` on updates, `response_format: "concise"` for token economy, and `get_board_snapshot` for orientation.

---

## The bundled reference agents

[`agents/`](../agents/README.md) ships three production-shaped agents that exercise the whole platform. It's a **standalone package** — its dependencies never touch the app build:

| Agent | Shape | Scopes | What it does |
| --- | --- | --- | --- |
| `bug-triage` | long-running webhook receiver | `read`, `write` | On every created task: sets bug severity, links duplicates, asks for repro steps (idempotent across webhook retries) |
| `crm-follow-up` | cron one-shot | `read`, `write` | Drafts follow-up comments on deals closing soon with no recent human activity |
| `standup` | cron one-shot | `read` | Daily digest of human vs. agent activity — stdout or Slack |

### Setup

```bash
cd agents
pnpm install
cp .env.example .env    # STACKS_MCP_URL, STACKS_TOKEN, runtime auth (below)
```

### Runtime variant A: Claude Agent SDK (default)

Set `ANTHROPIC_API_KEY` in `agents/.env`. That's it — `STACKS_AGENT_PROVIDER` defaults to `claude`.

### Runtime variant B: OpenAI Codex SDK (ChatGPT subscription)

No API key — it uses the credentials from a one-time interactive `codex login` on the machine that runs the agents:

```bash
npm i -g @openai/codex && codex login   # once, on the host
# in agents/.env:
STACKS_AGENT_PROVIDER=codex
```

Both runtimes run the same prompts against the same MCP server with shell/filesystem access disabled — the agent's whole world is the Stacks tool surface. `STACKS_AGENT_MODEL` optionally overrides the active runtime's model.

### Running them

```bash
pnpm standup          # one-shot; add SLACK_WEBHOOK_URL to post to Slack
pnpm crm-follow-up    # one-shot
pnpm bug-triage       # server on :8787 — create a task.created webhook pointing at it,
                      # put the webhook secret in STACKS_WEBHOOK_SECRET
```

Cron lines for the one-shots:

```cron
0 8 * * 1-5  cd /path/to/agents && pnpm standup
0 7 * * *    cd /path/to/agents && pnpm crm-follow-up
```

### Hosting variants

**Local machine (dev / trying it out).** Point `STACKS_MCP_URL` at your dev server (`http://localhost:3000/api/mcp`). For `bug-triage` against a *local* Stacks, set `STACKS_WEBHOOK_ALLOW_PRIVATE=1` on the Stacks side so the webhook may target localhost (dev only).

**Always-on host (recommended for production).** Any small VPS, Railway/Fly.io app, or spare machine:

1. `STACKS_MCP_URL=https://your-domain.com/api/mcp`, production PAT in `STACKS_TOKEN`.
2. Crontab entries for `standup` / `crm-follow-up`.
3. `bug-triage` as a service (systemd, `pm2`, or the platform's process manager), exposed via a public HTTPS URL — a tunnel like `cloudflared` works if the host has no public ingress. Point the workspace webhook at that URL.
4. Codex runtime: run `codex login` once on the host (or copy `~/.codex/auth.json` from a machine where you logged in).

**Vercel (not supported as-is).** The agents intentionally don't deploy with the app: `bug-triage` is a persistent server, both SDKs spawn local subprocesses with multi-minute runs, and Codex's subscription auth requires an interactive login. If you must run agent logic on Vercel, the path is a rewrite: fold the cron agents into the app as `CRON_SECRET`-guarded API routes using the Claude SDK with `ANTHROPIC_API_KEY`, schedule them in `vercel.json`, and accept the function-duration constraints. The always-on-host variant is simpler and keeps agents as true outside consumers of the API.

## Security checklist

- One token per agent, **least privilege** (the standup bot physically cannot mutate anything on a `read` token).
- **Pin every token to its workspace.**
- Set display name + emoji — unattributed bot activity is a smell.
- Rotate tokens by creating a new one and deleting the old; identity badges on past activity survive deletion.
- Watch per-token usage on `/account/tokens` — daily request/mutation counts surface runaway agents fast.
