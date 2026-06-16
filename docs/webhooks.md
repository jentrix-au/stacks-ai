# Outbound webhooks

Stacks can POST board events to your HTTPS endpoint — the push half of the agent platform (the pull half is the [MCP server](./agent-platform.md)). The bundled [bug-triage reference agent](./agents-setup.md#the-bundled-reference-agents) is a complete working receiver.

## Creating a webhook

Workspace **Settings → Webhooks** (workspace `ADMIN` role), or via admin-scoped MCP tools (`create_webhook`, `list_webhooks`, `delete_webhook`, `list_webhook_deliveries`). A webhook subscribes to one or more events on the workspace's boards; creating one returns a **secret** used to sign every delivery — store it, it's not shown again.

## Events

```
task.created      task.updated      task.moved        task.archived
column.created    column.updated    column.moved      column.archived
board.renamed     board.kind_changed
label.created     label.updated     label.deleted
comment.created   comment.updated   comment.deleted
attachment.created                  attachment.removed
deal.updated      bug.updated       ticket.updated    initiative.updated
task.due_soon     ticket.sla_breached        # system-generated (cron sweep)
automation.fired                             # from an automation's "fire webhook" action
```

## Delivery format

```http
POST /your/endpoint HTTP/1.1
Content-Type: application/json
X-Stacks-Event: task.created
X-Stacks-Delivery-Id: <unique per delivery>
X-Stacks-Timestamp: <ISO 8601>
X-Stacks-Signature: sha256=<hex hmac>

{ "id": "...", "event": "task.created", "createdAt": "...", "data": { ... } }
```

`data` carries identifiers (e.g. `task.created` → `{ boardId, workspaceId, taskId }`), not full entities — fetch what you need through MCP tools. This keeps payloads stable and means a leaked delivery exposes ids, not content.

## Verifying signatures

The signature is an HMAC-SHA256 of `"{timestamp}.{rawBody}"` with your webhook secret. Always verify before trusting a delivery, and reject stale timestamps to block replays:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(secret, headers, rawBody) {
  const expected =
    "sha256=" +
    createHmac("sha256", secret)
      .update(`${headers["x-stacks-timestamp"]}.${rawBody}`)
      .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(headers["x-stacks-signature"] ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Use the raw request body bytes — re-serializing parsed JSON breaks the signature.

## Retries and auto-disable

- The first delivery attempt happens right after the triggering request finishes.
- Failures retry with exponential backoff, up to **8 attempts** (drained by a cron sweep every 5 minutes).
- **Respond fast.** Deliveries time out after 5 seconds — ack with a 2xx immediately and process async. Use `X-Stacks-Delivery-Id` for idempotency on your side: retries redeliver the same id.
- After **3 consecutive deliveries exhaust all retries**, the webhook is automatically disabled. Re-enable by deleting and recreating it. Delivery history (pending / success / failed) is visible via `list_webhook_deliveries`.

## Security rules (SSRF guard)

Destination URLs are validated at creation **and** before every delivery:

- `https://` only, no credentials in the URL
- No localhost, private-range, or link-local destinations — checked after DNS resolution
- Redirects are not followed

For local development against a receiver on your machine, set `STACKS_WEBHOOK_ALLOW_PRIVATE=1` in dev only — never in production. To reach a local receiver from a deployed Stacks, use a tunnel (e.g. `cloudflared`) that gives you a public HTTPS URL.
