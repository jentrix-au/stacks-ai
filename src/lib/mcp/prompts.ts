import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// MCP prompts (P2.5): canned workflows that turn the tool surface into
// repeatable agent routines. Prompts render instructions only — all data
// access happens through the named tools, under the caller's own token.

function userMessage(text: string) {
  return {
    messages: [
      { role: "user" as const, content: { type: "text" as const, text } },
    ],
  };
}

export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    "triage_bugs",
    {
      title: "Triage bugs",
      description:
        "Walk the untriaged column of a BUGS board: set severity, fill repro fields, and link duplicates.",
      argsSchema: {
        boardId: z
          .string()
          .describe("The BUGS board to triage (find it via list_boards)."),
      },
    },
    ({ boardId }) =>
      userMessage(
        `Triage the BUGS board ${boardId} in Stacks.

1. Call get_board_snapshot with boardId "${boardId}" to see its columns and tasks. Identify the untriaged column (usually "Triage").
2. For each task in that column, call get_task (response_format "detailed") and read the title, description, and bugReport sidecar.
3. Assign a severity with update_bug_report (TRIVIAL / MINOR / MAJOR / CRITICAL / BLOCKER) based on user impact and scope. If reproSteps, expectedBehavior, or actualBehavior can be inferred from the description, fill them in the same call.
4. Check for duplicates: call search_tasks with distinctive words from the title. If you find an existing bug describing the same problem, call add_task_link with kind "DUPLICATES" (from the new bug to the original) and note it in a comment via create_comment.
5. Move fully-triaged tasks out of the triage column with move_task to the appropriate next column (e.g. "Open").
6. Finish with a summary: tasks triaged, severities assigned, duplicates linked, and anything you could not classify (with why).`,
      ),
  );

  server.registerPrompt(
    "daily_standup",
    {
      title: "Daily standup",
      description:
        "Summarize what happened on a board since a given time, split by humans vs agents.",
      argsSchema: {
        boardId: z
          .string()
          .describe("Board to summarize (find it via list_boards)."),
        since: z
          .string()
          .describe(
            "ISO timestamp to diff from, e.g. yesterday's standup time (2026-06-11T09:00:00Z).",
          ),
      },
    },
    ({ boardId, since }) =>
      userMessage(
        `Prepare a standup summary for board ${boardId} in Stacks covering everything since ${since}.

1. Call list_activity with boardId "${boardId}" and since "${since}" (paginate with the cursor until exhausted).
2. Group the activity by task (use taskKey) and by actor (actorName). The payload.source field tells you whether a change came from a human ("ui") or an agent ("mcp") — report agent work separately.
3. Call get_board_snapshot with boardId "${boardId}" to see current column distribution.
4. Produce: (a) shipped/moved-to-done tasks, (b) in-progress work with owners, (c) new tasks created, (d) blockers — tasks with incoming BLOCKS links (check list_task_links on anything that looks stuck), (e) a one-line agent-activity digest.
Keep it tight: one line per task, keys (like STK-42) first.`,
      ),
  );

  server.registerPrompt(
    "pipeline_review",
    {
      title: "Pipeline review",
      description:
        "Review a CRM board: pipeline value by stage, deals closing soon, stale deals.",
      argsSchema: {
        workspaceId: z
          .string()
          .describe("Workspace whose CRM pipeline to review."),
      },
    },
    ({ workspaceId }) =>
      userMessage(
        `Review the sales pipeline in Stacks workspace ${workspaceId}.

1. Call list_boards with workspaceId "${workspaceId}" and find the board(s) with kind "CRM".
2. For each CRM board, call list_tasks with response_format "detailed" (paginate until exhausted). Each task's deal sidecar carries amount, currency, and expectedCloseAt; the columnName is the pipeline stage.
3. Compute: total pipeline value by stage (group amounts by columnName and currency), deals with expectedCloseAt within the next 30 days, and stale deals (updatedAt older than 14 days that are not in a terminal stage like "Won"/"Lost").
4. For the 3 largest deals, call get_task and check contacts and recent activity — flag any big deal with no activity in 7+ days.
5. Report: stage-by-stage table (count + value), expected closes this month, stale/at-risk deals with task keys, and recommended follow-ups.`,
      ),
  );

  server.registerPrompt(
    "sla_watch",
    {
      title: "SLA watch",
      description:
        "Find SUPPORT tickets that breached or are about to breach their SLA.",
      argsSchema: {
        boardId: z
          .string()
          .describe("The SUPPORT board to watch (find it via list_boards)."),
        withinHours: z
          .string()
          .optional()
          .describe(
            "Look-ahead window in hours for upcoming breaches (default 24).",
          ),
      },
    },
    ({ boardId, withinHours }) =>
      userMessage(
        `Audit SLA health on SUPPORT board ${boardId} in Stacks. Look-ahead window: ${withinHours ?? "24"} hours.

1. Call list_tasks with boardId "${boardId}" and response_format "detailed" (paginate until exhausted). Each task's ticket sidecar carries slaDueAt, firstResponseAt, resolvedAt, and severity.
2. Classify every unresolved ticket (resolvedAt null): BREACHED (slaDueAt in the past), AT RISK (slaDueAt within the window), OK, or NO SLA (slaDueAt null).
3. For BREACHED and AT RISK tickets, call get_task to check assignees and the latest activity; note tickets with no assignee or no firstResponseAt.
4. Escalate in-app: for each BREACHED ticket, create_comment summarizing the breach (when it breached, severity, current owner) so the team sees it on the card.
5. Report: breached (with how long overdue), at-risk (time remaining), unassigned/no-first-response offenders, and suggested priority order — most severe and longest-overdue first.`,
      ),
  );
}
