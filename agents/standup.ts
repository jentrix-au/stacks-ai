/**
 * Standup agent (P4.2) — a read-only daily digest. Run it from cron each
 * morning:
 *
 *   0 8 * * 1-5  cd agents && pnpm standup
 *
 * It diffs the last 24h of workspace activity through list_activity — using
 * the `source` filter to separate what humans did from what agents and
 * automations did (P2.3/P4.1) — and writes a short digest to stdout, or to
 * Slack when SLACK_WEBHOOK_URL is set. A read-scoped token is enough: mint
 * it with only the "read" scope and the digest can never mutate anything.
 */
import { hoursAgo, runStacksAgent } from "./lib/stacks.js";

const STANDUP_SYSTEM_PROMPT = `You are the Stacks standup agent. You produce
a daily digest strictly by READING through the Stacks MCP tools — you never
mutate anything.

Rules:
- Use list_workspaces (if needed) and list_activity with the \`since\` you
  were given. Query twice: source "ui" for human work, source "mcp" for
  agent work; mention system/automation rows only if notable.
- Group by board. For each: what moved/shipped, what was created, what is
  blocked (tasks with open BLOCKS links — get_task on the few that matter).
- Call out overdue tasks and SLA breaches if any appear in the activity.
- Keep it under ~25 lines of plain markdown: a "👥 Humans" section, a
  "🤖 Agents" section, and a "⚠️ Needs attention" section. Reference tasks
  by their key (e.g. STK-12). No preamble — output only the digest.`;

const digest = await runStacksAgent(
  `Produce the standup digest for activity since ${hoursAgo(24)}.`,
  { systemPrompt: STANDUP_SYSTEM_PROMPT, maxTurns: 25 },
);

const slackUrl = process.env.SLACK_WEBHOOK_URL;
if (slackUrl) {
  const res = await fetch(slackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: digest }),
  });
  if (!res.ok) {
    console.error(`Slack post failed (${res.status}); digest below.`);
    console.log(digest);
    process.exit(1);
  }
  console.log("Digest posted to Slack.");
} else {
  console.log(digest);
}
