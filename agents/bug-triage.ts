/**
 * Bug-triage agent (P4.2) — closes the P2 agent loop end-to-end:
 *
 *   Stacks webhook (task.created, HMAC-signed, P2.6)
 *     → this receiver verifies the signature
 *     → an agent session (Claude or Codex runtime — see lib/stacks.ts)
 *       works the task through MCP tools (P2.x)
 *     → severity set, duplicates linked, repro asked for — all attributed
 *       to the token's agent identity in the activity feed (P4.1).
 *
 * Setup: create a webhook in workspace settings pointing at this server
 * (events: task.created), and put its secret in STACKS_WEBHOOK_SECRET.
 * Run: pnpm bug-triage   (listens on PORT, default 8787)
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

import { runStacksAgent } from "./lib/stacks.js";

const PORT = Number(process.env.PORT ?? 8787);
const SECRET = process.env.STACKS_WEBHOOK_SECRET ?? "";
if (!SECRET) {
  console.error(
    "Missing STACKS_WEBHOOK_SECRET (from the webhook you created).",
  );
  process.exit(1);
}
/** Reject deliveries older than this — replay-attack guard. */
const MAX_SKEW_MS = 5 * 60 * 1000;

/** The signature scheme documented in CLAUDE.md (P2.6). */
function verifySignature(
  headers: Record<string, string | string[] | undefined>,
  rawBody: string,
): boolean {
  const signature = headers["x-stacks-signature"];
  const timestamp = headers["x-stacks-timestamp"];
  if (typeof signature !== "string" || typeof timestamp !== "string") {
    return false;
  }
  const age = Math.abs(Date.now() - new Date(timestamp).getTime());
  if (!Number.isFinite(age) || age > MAX_SKEW_MS) return false;
  const expected =
    "sha256=" +
    createHmac("sha256", SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

const TRIAGE_SYSTEM_PROMPT = `You are the Stacks bug-triage agent. You act on
ONE newly created task per run, strictly through the Stacks MCP tools.

Rules:
- First call get_task. If the task has no "bug" sidecar (it is not on a BUGS
  board), reply "not a bug task — skipped" and STOP. Do nothing else.
- If the bug report has no severity, infer one from the title/description
  (crash/data-loss/security → CRITICAL or HIGH, broken feature → MEDIUM,
  cosmetic/typo → LOW) and set it with update_bug_report.
- Call search_tasks with the most distinctive words from the title. If an
  existing open task clearly describes the same defect, link it with
  add_task_link kind DUPLICATES (the new task as fromTaskId); if it is merely
  related, use RELATES_TO. Never link the task to itself; at most 2 links.
- If the description lacks reproduction steps (no numbered steps, no
  "steps to reproduce"), post ONE create_comment asking the reporter for
  steps, expected vs actual behavior, and version. Use the idempotencyKey
  you were given so webhook retries never double-comment.
- Tool errors are structured JSON with { error: { code, hint } } — follow
  the hint rather than retrying blindly.
- Finish with a one-line summary of what you did.`;

async function triage(taskId: string, deliveryId: string): Promise<void> {
  const summary = await runStacksAgent(
    `Triage the newly created task ${taskId}. ` +
      `Use "triage-${deliveryId}" as the idempotencyKey for any create_comment call.`,
    { systemPrompt: TRIAGE_SYSTEM_PROMPT, maxTurns: 20 },
  );
  console.log(`[triage ${taskId}] ${summary}`);
}

// One task at a time: webhook bursts (bulk imports) queue instead of racing.
let chain: Promise<void> = Promise.resolve();

const server = createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405).end();
    return;
  }
  let rawBody = "";
  req.on("data", (chunk) => (rawBody += chunk));
  req.on("end", () => {
    if (!verifySignature(req.headers, rawBody)) {
      res.writeHead(401).end("bad signature");
      return;
    }
    const event = req.headers["x-stacks-event"];
    const deliveryId = String(req.headers["x-stacks-delivery-id"] ?? "unknown");
    // Webhook bodies are { id, event, createdAt, data } (P2.6); task.created
    // data carries { boardId, workspaceId, taskId }.
    const body = JSON.parse(rawBody) as { data?: { taskId?: string } };
    const taskId = body.data?.taskId;

    // Ack fast — Stacks retries slow/failed deliveries with backoff, and the
    // triage run can take a while. The signature check above already ran.
    res.writeHead(202).end("queued");

    if (event !== "task.created" || !taskId) return;
    chain = chain
      .then(() => triage(taskId, deliveryId))
      .catch((err) => console.error(`[triage ${taskId}] failed:`, err));
  });
});

server.listen(PORT, () => {
  console.log(`bug-triage agent listening on :${PORT} (POST webhook here)`);
});
