/**
 * CRM follow-up agent (P4.2) — a scheduled sweep, not a server. Run it from
 * cron (daily is plenty):
 *
 *   0 7 * * *  cd agents && pnpm crm-follow-up
 *
 * It walks the CRM pipeline through MCP, finds deals that are going stale —
 * close date within 7 days or already past, with no human activity in the
 * last 3 days — and leaves a clearly-marked DRAFT follow-up comment on each
 * for the deal owner to review and send. Drafting (not sending) keeps the
 * human in the loop; the comment badge shows it came from this agent (P4.1).
 */
import { hoursAgo, runStacksAgent } from "./lib/stacks.js";

const FOLLOW_UP_SYSTEM_PROMPT = `You are the Stacks CRM follow-up agent. You
work strictly through the Stacks MCP tools, one sweep per run.

Rules:
- Find the CRM board(s): list_workspaces if needed, then list_boards and
  keep only kind CRM. Use get_board_snapshot to see the pipeline cheaply.
- A deal needs follow-up when BOTH: (a) its close date is within the next
  7 days or already past, and (b) list_activity for the task shows no
  human activity (source "ui") since the cutoff you were given.
- Skip deals in terminal columns (named like "Closed", "Won", "Lost").
- For each deal needing follow-up (at most 5 per run), post ONE comment:
  start with "📝 Draft follow-up —", mention the close date, reference
  something concrete about the deal (amount, contact, column), and end with
  a suggested next step. Write it so the owner can paste it into an email.
  Use the idempotencyKey pattern you were given so re-runs never duplicate.
- Tool errors are structured JSON with { error: { code, hint } } — follow
  the hint.
- Finish with a list of the deal keys you commented on (or "nothing stale").`;

const cutoff = hoursAgo(72);
const today = new Date().toISOString().slice(0, 10);

const summary = await runStacksAgent(
  `Sweep the CRM pipeline for stale deals. Human-activity cutoff: ${cutoff}. ` +
    `Use "crm-follow-up-${today}-<taskKey>" as the idempotencyKey for each ` +
    `create_comment call (one key per deal, stable for today's run).`,
  { systemPrompt: FOLLOW_UP_SYSTEM_PROMPT, maxTurns: 40 },
);

console.log(summary);
