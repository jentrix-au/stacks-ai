# Agent platform (MCP)

Stacks exposes its entire task surface as an [MCP](https://modelcontextprotocol.io) server, so AI agents operate boards with the same operations, authorization, and audit trail as the UI. This page is the platform reference: tokens, scopes, the tool catalog, and the contracts (errors, idempotency, concurrency) agents rely on. For client-by-client connection instructions, see [Agent setup variants](./agents-setup.md).

## Endpoint and authentication

```
https://your-domain.com/api/mcp      (Streamable HTTP)
Authorization: Bearer <token>
```

Two bearer types are accepted:

- **Personal access tokens** (`tm_…`) — minted at `/account/tokens`. The right choice for your own scripts, cron agents, and CLIs.
- **OAuth 2.1 access tokens** (`tmo_…`) — issued by the built-in authorization server for third-party clients (see [OAuth](#oauth-21-for-third-party-clients)).

## Tokens, scopes, and workspace pinning

Create tokens at `/account/tokens`. Each token has:

- **Scopes** — exact-match classes, no hierarchy:

  | Scope | Allows |
  | --- | --- |
  | `read` | All `list_*` / `get_*` / search tools and MCP resources |
  | `write` | Creating and updating tasks, comments, subtasks, contacts, sidecars, links, labels, columns, boards |
  | `admin` | Structural/destructive and outward-facing tools: `convert_board_kind`, webhooks, automations |

  A tool call outside the token's scopes returns a structured `FORBIDDEN` error before anything runs. (Tokens created before scoping existed have full access until rotated — the tokens page nags about them.)

- **Workspace pinning** (recommended) — restrict the token to a single workspace. Every authorization check rejects anything outside it, and `list_workspaces` only returns the pinned one.

- **Agent identity** — an optional display name and emoji. Every mutation the token makes is badged in the UI as `via <emoji> <name>` (activity feeds, comment threads, the home digest). The identity is snapshotted into each activity at write time, so the audit trail survives token renames and deletion.

- **Usage tracking** — the tokens page shows per-token daily requests/mutations for the last 7 days plus the token's recent actions.

Tokens are personal credentials — only their owner manages them at `/account/tokens`. For governance, workspace **admins** additionally see every token *pinned to their workspace* (any member's) in workspace settings — owner, scopes, last used — and can revoke them there. Unpinned tokens aren't listed; removing the member disables those, since every call re-checks the owner's role.

**Least-privilege examples**: a read-only digest bot needs just `read`; a triage bot needs `read` + `write`; only a bot that manages webhooks or automation rules needs `admin`. Pin everything to one workspace unless it genuinely needs more.

## Rate limits

**60 requests per minute per token.** Over the limit, calls still authenticate but every tool returns a `RATE_LIMITED` error envelope with `retryAfterSeconds` — agents should back off and retry, not treat it as a dead token.

## Error envelope

Failed tool calls return `isError: true` with a machine-readable JSON body:

```json
{ "error": { "code": "CONFLICT", "message": "…", "hint": "…" } }
```

| Code | Meaning |
| --- | --- |
| `FORBIDDEN` | Missing scope, wrong workspace, or insufficient role |
| `NOT_FOUND` | Entity doesn't exist or isn't visible to you |
| `INVALID_INPUT` | Failed validation (the message says which field) |
| `RATE_LIMITED` | Over 60 req/min — carries `retryAfterSeconds` |
| `CONFLICT` | Idempotency-key reuse with different args, or a stale write (see below) |
| `INTERNAL` | Unexpected server error |

The `hint` is written for agents — follow it instead of retrying blindly.

## Concurrency: `expectedUpdatedAt`

Every `update_*` tool and `move_task` accept an optional `expectedUpdatedAt` (the entity's `updatedAt` you last read). If someone changed the entity since, the call fails with `CONFLICT` — and the envelope embeds the entity's **current** state under `error.current`, so you can merge and retry without an extra read. Omit the field to last-write-wins.

## Idempotency: `idempotencyKey`

Every `create_*` and `bulk_*` tool accepts an optional `idempotencyKey` (24-hour memory, scoped per token):

- Same key + same arguments → the stored response is replayed; nothing is created twice.
- Same key + different arguments → `CONFLICT`.

Derive keys from your trigger (e.g. a webhook delivery id) so retries are naturally safe.

## Response sizes: `response_format`

`list_tasks`, `get_task`, and `list_contacts` take `response_format: "concise" | "detailed"`. Lists default to concise (≤400 chars per task, ≤20k chars per page — a frozen contract); `get_task` defaults to detailed. Paginated lists return `totalCount` and a `notice` when truncated. Every task in any response includes its `number` and human key (`STK-123`), and `get_task` accepts `{ workspaceId, number }` as an alternative to the task id.

## Tool catalog (54 tools)

The surface is frozen by contract tests — names, annotations, and output schemas only change deliberately.

### Orientation and reads (`read` scope)

| Tool | What it does |
| --- | --- |
| `list_workspaces` | Workspaces visible to the token |
| `get_board_snapshot` | Board + columns + concise tasks in one call — **start here** |
| `search_tasks` | Workspace-wide full-text search (titles, descriptions, comments) |
| `find_similar_tasks` | Semantic similarity — by example task (`taskId`) or free-text query (`workspaceId` + `query`). Returns empty + notice when embeddings aren't configured |
| `list_activity` | Activity feed by task or board, filterable by time, type, and **source** (`ui` / `mcp` / `automation`) — separates humans from agents |
| `list_boards` / `list_columns` / `list_labels` / `list_members` | Workspace structure |
| `list_tasks` / `get_task` | Tasks (filters, pagination, concise/detailed) |
| `list_comments` / `list_attachments` | Task discussion + files (attachments via short-lived signed URLs) |
| `list_contacts` / `list_initiatives` / `list_task_links` | Directory, roadmap, and link-graph reads |

### Task writes (`write` scope)

| Tool | What it does |
| --- | --- |
| `create_task` / `update_task` / `move_task` / `archive_task` | The core lifecycle (archive = complete) |
| `set_task_labels` / `set_task_assignees` | Replace-style setters |
| `bulk_create_tasks` | Up to a column's worth in one all-or-nothing transaction |
| `bulk_update_tasks` / `bulk_move_tasks` | Per-item validation; valid writes apply in one transaction with per-item results |
| `create_comment` / `update_comment` / `delete_comment` | Comments (`mentions` param notifies members; edits are author-only) |
| `create_subtask` / `toggle_subtask` / `delete_subtask` | Checklists |
| `add_task_link` / `remove_task_link` | Dependency graph (BLOCKS / DEPENDS_ON / RELATES_TO / DUPLICATES; cycles rejected with the path) |

### Kind sidecars and contacts (`write` scope)

| Tool | What it does |
| --- | --- |
| `update_deal` / `set_deal_contacts` | CRM deal fields + linked contacts |
| `update_ticket` / `link_contact` | Support ticket fields + its contact |
| `update_bug_report` | Bug severity, repro, versions, resolution |
| `update_initiative` | Roadmap quarter, confidence, effort, RICE |
| `create_contact` / `update_contact` / `archive_contact` | The People directory |

### Structure (`write` scope)

| Tool | What it does |
| --- | --- |
| `create_board` / `rename_board` | Boards (kind chosen at creation) |
| `manage_columns` / `manage_labels` | Consolidated action-param tools (create / rename / move / archive…) |

### Admin (`admin` scope)

| Tool | What it does |
| --- | --- |
| `convert_board_kind` | Convert a board between kinds (backfills sidecars) |
| `create_webhook` / `list_webhooks` / `delete_webhook` / `list_webhook_deliveries` | [Outbound webhooks](./webhooks.md) |
| `list_automations` / `create_automation` / `set_automation_enabled` | [Automation rules](./automations.md) |

All tools carry proper MCP spec annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint: false`) and typed output schemas, so clients can reason about safety before calling.

## Resources

Read-only context documents (require `read` scope; honor workspace pinning):

| URI | Contents |
| --- | --- |
| `stacks://workspace/{id}` | Workspace overview: boards, members, counts (the template lists your workspaces) |
| `stacks://board/{id}` | Concise board snapshot |
| `stacks://task/{key}` | Full task detail by human key, e.g. `stacks://task/STK-42` |

## Prompts

Canned workflows over the tool surface, ready to invoke from MCP clients that support prompts:

- `triage_bugs` — work the Triage column of a bugs board
- `daily_standup` — summarize the last 24h of activity, humans vs. agents
- `pipeline_review` — CRM pipeline health pass
- `sla_watch` — find tickets at or near SLA breach

## OAuth 2.1 (for third-party clients)

For clients you don't mint a PAT for (e.g. hosted agent products), Stacks ships a complete OAuth 2.1 authorization server:

- **Discovery**: RFC 9728 protected-resource metadata at `/.well-known/oauth-protected-resource`; RFC 8414 AS metadata at `/.well-known/oauth-authorization-server`.
- **Flow**: authorization code + PKCE (S256, required). `GET /oauth/authorize` shows a consent screen where *you* pick the scopes and workspace the client gets; `POST /oauth/token` exchanges codes and rotates refresh tokens (single-use; the paired access token is revoked on rotation).
- **Client registration is CIMD**: the `client_id` is an HTTPS URL serving the client's metadata document — no manual registration step.
- **Tokens**: access tokens (`tmo_`) live 1 hour; refresh tokens (`tmr_`) are never valid as bearers. OAuth grants get the same scope/workspace model as PATs, and the client's name automatically becomes the agent identity badge.
- **Token lists stay clean**: because each refresh mints a fresh access token, expired and rotated-away `tmo_` rows are hidden from the tokens page and workspace governance list — only the live one shows. (Revoked PATs remain visible for audit.)

## Attribution and auditability

Everything an agent does is tagged `source: "mcp"` with the token's id, name, and identity snapshotted into the activity payload. In the UI this renders as the agent badge; over the API, `list_activity` can filter by source — so "what did the bots do yesterday?" is one call. The bundled [standup agent](./agents-setup.md#the-bundled-reference-agents) is exactly that.
