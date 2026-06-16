# Automations

Automations are per-board rules: **when** something happens (trigger), optionally **if** conditions match, **do** something (actions). They run server-side, instantly for UI/agent-triggered events and within ~5 minutes for time-based ones.

## Managing rules

Board menu → **Automations** (workspace `ADMIN` role required). The dialog offers a template builder for the common recipes:

- When a task **moves to a column** → **assign** someone
- When a task **moves to a column** → set **priority**
- When a task is **created** → add a **label**
- When a task's **due date passes** → post a **comment**

Each rule shows its run count; rules can be enabled/disabled without deleting them.

Agents can manage rules too (admin-scoped tokens): `list_automations`, `create_automation`, `set_automation_enabled`.

## Triggers

| Trigger | Fires when | Options |
| --- | --- | --- |
| `task.created` | A task is created on the board | — |
| `task.moved_to_column` | A task lands in a column | restrict to one column |
| `label.added` | A label is added to a task | restrict to one label |
| `due.passed` | A task's due date passes (checked every 5 min) | — |
| `sla.breached` | A ticket's SLA due time passes unresolved | — |

## Actions

Actions run through the same operations core as everything else — full authorization, activity logging, notifications, webhooks, and realtime sync apply. Available actions include assigning a member, setting priority, adding a label, posting a comment, and **fire webhook** (emits an `automation.fired` event to the board's [outbound webhooks](./webhooks.md)).

## Execution semantics — what keeps this safe

- **Rules act as their creator.** An automation's actions are attributed to the user who created the rule, with source `automation` — the activity feed marks them with a `via ⚡ automation` chip so they're never mistaken for manual actions.
- **Rules can never trigger rules.** Automation-sourced events are dropped by the dispatcher before rule matching — a hard loop guard. A rule that moves a task will not fire another rule's `task.moved_to_column` trigger, ever.
- **Malformed rules are skipped, not fatal.** Rule definitions are re-validated at execution time; a broken rule logs and skips rather than blocking the pipeline.
- **Every run is auditable.** Each execution increments the rule's run count and writes an `AUTOMATION_RAN` activity carrying the rule's id and name.

## Triggers from agents

Events caused by MCP agents (e.g. an agent creating a task) **do** fire automations — only automation-sourced events are exempt. If you want an agent-driven workflow that *doesn't* trip a rule, scope the rule's trigger options (column/label) accordingly.
