# Stacks documentation

Stacks is a Trello-style task manager with five specialized board kinds (kanban, CRM, support desk, bug tracker, roadmap), built-in automations, and a first-class **agent platform**: every task operation in the UI is also exposed as an MCP tool, so AI agents work the same boards humans do — with their own identity, scoped tokens, and full audit attribution.

| Guide | What it covers |
| --- | --- |
| [Getting started](./getting-started.md) | Local setup, environment variables, seeding, signing in, running tests |
| [User guide](./user-guide.md) | Everything in the UI: workspaces, boards & kinds, tasks, filters, saved views, bulk edit, search, My Work, inbox, dashboards, roadmap, contacts, import/export |
| [Automations](./automations.md) | The rules engine: triggers, actions, the loop guard, managing rules |
| [Webhooks](./webhooks.md) | Outbound webhooks: events, HMAC signature verification, retries, security rules |
| [Agent platform](./agent-platform.md) | The MCP server: tokens & scopes, the 54-tool catalog, resources, prompts, idempotency, concurrency, OAuth 2.1 |
| [Agent setup variants](./agents-setup.md) | Connecting Claude Code, claude.ai, Codex/ChatGPT, Cursor, custom SDK agents, and the bundled reference agents — plus where to host them |
| [Deployment](./deployment.md) | Vercel + Neon production setup: env var matrix, cron jobs, OAuth providers, optional services |

## Quick orientation

- **MCP endpoint:** `https://your-domain.com/api/mcp` (Streamable HTTP, Bearer auth) — `http://localhost:3000/api/mcp` in dev
- **Personal access tokens:** `/account/tokens` in the app
- **Repo layout:** the Next.js app lives in `src/`; the standalone reference agents live in [`agents/`](../agents/README.md); contributor-facing architecture notes are in [`CLAUDE.md`](../CLAUDE.md) / [`AGENTS.md`](../AGENTS.md)

## The 30-second model

```
Workspace  →  Board (TASKS | CRM | SUPPORT | BUGS | ROADMAP)
                 →  Column  →  Task (key like STK-123)
                                 ├─ labels, assignees, due date, priority
                                 ├─ subtasks, comments (@mentions), attachments
                                 ├─ kind sidecar: Deal / Ticket / BugReport / Initiative
                                 └─ links to other tasks (BLOCKS, DEPENDS_ON, …)
```

Humans mutate tasks through the UI; agents mutate them through MCP tools; automations mutate them through rules. All three paths converge on one operations core, so authorization, activity logging, notifications, webhooks, and realtime sync behave identically no matter who — or what — made the change.
