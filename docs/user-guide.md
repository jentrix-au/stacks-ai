# Stacks user guide

Everything you can do in the Stacks UI. For agents and integrations, see the [agent platform](./agent-platform.md) and [agent setup](./agents-setup.md) guides.

## Contents

- [Core concepts](#core-concepts)
- [Workspaces and members](#workspaces-and-members)
- [Boards and board kinds](#boards-and-board-kinds)
- [Working with tasks](#working-with-tasks)
- [The board view](#the-board-view)
- [Task links and dependencies](#task-links-and-dependencies)
- [Board-kind guides: CRM, Support, Bugs, Roadmap](#board-kind-guides)
- [Contacts (People)](#contacts-people)
- [Search](#search)
- [My Work](#my-work)
- [Inbox and notifications](#inbox-and-notifications)
- [Activity and attribution](#activity-and-attribution)
- [Dashboards](#dashboards)
- [Import and export](#import-and-export)

---

## Core concepts

- **Workspace** — the top-level container: members, boards, contacts, tokens, webhooks. Each workspace has a URL slug (`/acme/...`) and a task prefix (`ACME`).
- **Board** — a kanban surface inside a workspace. Every board has a **kind** that shapes its columns and task fields (see below).
- **Column** — a stage on a board. Drag to reorder; archive when unused.
- **Task** — the unit of work. Every task gets a permanent human-readable key like `STK-123` (workspace prefix + per-workspace sequence number) that never changes, even when the task moves between columns.
- **Completing = archiving.** Stacks has no separate "done" flag — when work is finished (or abandoned), archive the task from the detail panel header. Archived tasks disappear from boards, search, and dashboards but keep their history.

## Workspaces and members

- Your first workspace is created automatically on sign-up; create more from the workspace switcher (top-left).
- **Members** (`/[workspace]/members`): invite people by email — they receive a link (`/invite/...`) that adds them on acceptance.
- **Roles**: `OWNER`, `ADMIN`, `MEMBER`. Members can do day-to-day work (tasks, comments, boards, views). Admin-level actions — converting a board's kind, managing webhooks and automations, running imports — require `ADMIN` or `OWNER`.
- **Settings** (`/[workspace]/settings`): workspace name, webhooks, agent-token governance (admins see and can revoke any member's token pinned to the workspace), and links to the import wizard and your personal API tokens.

## Boards and board kinds

Every board has a kind, chosen at creation. The kind decides which columns are seeded and which extra fields tasks carry:

| Kind | Seeded columns | Extra task fields (sidecar) |
| --- | --- | --- |
| `TASKS` (default) | Backlog · In progress · In review · Done | — |
| `CRM` | Lead · Qualified · Proposal · Negotiation · Won · Lost | **Deal**: amount + currency, expected close date, linked contacts |
| `SUPPORT` | New · Open · Waiting on customer · Resolved · Closed | **Ticket**: severity, SLA due, first response, resolved, source, one linked contact |
| `BUGS` | Triage · Open · In progress · Fixed · Verified · Closed | **Bug report**: severity, repro steps, expected/actual behavior, affected version, environment, resolved |
| `ROADMAP` | Discovery · In design · In build · Shipped · Won't do | **Initiative**: target quarter, confidence, effort, RICE score |

The seeded columns are a starting point — rename, add, reorder, or archive them freely.

**Converting a board between kinds** (board menu → admin-only): every open task is backfilled with the new kind's sidecar in one transaction. Existing sidecars from the old kind are preserved (nothing is deleted), so converting back loses nothing.

## Working with tasks

**Creating tasks.** Use the inline composer at the bottom of any column. On non-TASKS boards the composer offers kind-specific quick fields so you capture the essentials in one step — deal amount + contact on CRM, severity + contact on Support, severity + affected version on Bugs, target quarter on Roadmap.

**The detail panel.** Click a card to open it. From there you can edit:

- Title, description, **priority** (Low / Medium / High / Urgent), **due date**
- **Labels** (workspace-scoped, colored; manage them from the board)
- **Assignees** (any workspace member, multiple allowed)
- **Subtasks** — a lightweight checklist with progress shown on the card
- **Comments** — with `@mentions` (autocomplete over workspace members; mentioned people are notified)
- **Attachments** — files upload to cloud storage; downloads use short-lived signed URLs
- The kind sidecar section (Deal / Ticket / Bug report / Initiative)
- **Activity** — the full audit trail (see [Activity and attribution](#activity-and-attribution))
- **Archive** — the header button; this is how tasks are completed

**Deep links.** `/[workspace]/board/[board]?task=<id>` opens the board with that task's panel expanded — search results, notifications, and the roadmap graph all link this way.

## The board view

- **Drag and drop** cards between columns and within a column; column order itself is also draggable. Position is preserved per board and syncs to everyone in real time.
- **Realtime**: other users' (and agents') changes appear live — no refresh needed.
- **Filters** (top bar): by label, assignee, priority, and due window (Overdue / Today / This week). Filters live in the URL, so a filtered board can be bookmarked or shared.
- **Sort**: Priority, Due date, or Newest — or leave unset for manual ordering. While a sort is active the visible order is computed, so same-column dragging is disabled; dropping a card into another column appends it at the end.
- **Saved views**: save the current filter + sort combination under a name; views appear as chips in the top bar for one-click recall. Any member can create views; views can be shared with the board; deleting needs the creator or a board admin.
- **Multi-select and bulk edit**: shift-click cards to select several (plain click opens the panel and clears the selection). A floating action bar then applies **move to column, set priority, add label, assign, or archive** to the whole selection at once.

## Task links and dependencies

Tasks can be linked across **any** boards in a workspace — a bug can block a roadmap initiative, a support ticket can relate to a deal:

| Link kind | Meaning |
| --- | --- |
| `BLOCKS` | The source task blocks the target |
| `DEPENDS_ON` | The source task depends on the target |
| `RELATES_TO` | Loose association, no direction semantics |
| `DUPLICATES` | The source duplicates the target |

- Cards show a red **Blocked** badge while any non-archived task blocks them.
- `BLOCKS` / `DEPENDS_ON` cycles are rejected — the error names the exact cycle path by task key (e.g. `STK-7 → STK-6 → STK-7`).
- Both linked tasks get an activity entry, so the relationship is auditable from either side.

## Board-kind guides

### CRM

Deals move through the pipeline columns; the Deal sidecar holds amount (with currency), expected close date, and any number of linked contacts from the workspace [People directory](#contacts-people). The [CRM dashboard](#dashboards) aggregates pipeline value by stage and owner and shows what's closing this quarter.

### Support

Tickets carry severity, an SLA due time, first-response and resolved timestamps, an intake source (email/chat/phone/other), and one linked contact. When a ticket's SLA due time passes unresolved, the system writes an **SLA breached** activity and notifies the assignees — exactly once per breach. Agents and automations can react to the same event (`ticket.sla_breached`).

### Bugs

Bug reports carry severity, repro steps, expected vs. actual behavior, affected version, and environment. Resolving/reopening is tracked (resolution transitions appear in activity as Bug resolved / Bug reopened). With the semantic layer configured, the panel shows a **"Possible duplicates"** section — semantically similar open bugs with one-click "Link duplicate".

### Roadmap

Initiatives carry a target quarter, confidence, effort, and a RICE score. `/[workspace]/roadmap` renders the **dependency graph**: all open initiatives plus anything that blocks them (including blockers from other boards), laid out left-to-right, blocked nodes outlined red. Clicking a node deep-links to the task.

## Contacts (People)

`/[workspace]/contacts` is the shared directory used by both CRM deals and support tickets: name, email, phone, company, and an optional external ID for syncing with other systems. Contacts are workspace-level — one person, linked everywhere.

**Merging duplicates**: select a duplicate and a survivor and hit Merge — deal links and tickets move to the survivor, empty fields on the survivor are filled from the duplicate, and the duplicate is deleted. One transaction; nothing is lost.

## Search

- **Cmd-K** opens the command palette anywhere; `/[workspace]/search` is the full-page version.
- Search covers task titles **and descriptions**, comment bodies (matches surface the parent task), and contacts — with proper word matching (stemming, multi-word queries) plus substring fallback for partial words and identifiers.
- Archived items never appear in results.
- Results deep-link straight to the task panel.

## My Work

`/[workspace]/my-work` is your cross-board focus page: **Overdue**, **Due today**, and **Assigned to me** (each task appears in exactly one group). The workspace home page shows a compact digest of the same plus recent workspace activity.

## Inbox and notifications

You're notified when you are **assigned**, **@mentioned**, or when a task you watch gets a **comment** — plus system notices when a task you're assigned to is **due soon / overdue** or a ticket **breaches its SLA**. Watching is automatic: you watch tasks you created, tasks you're assigned to, and tasks you've commented on.

- The **bell** in the top bar shows your unread count; `/[workspace]/inbox` lists everything. Clicking through marks the notification read; "Mark all read" clears the lot.
- **Email**: mentions and assignments can also email you immediately — a per-user toggle on the inbox page. A **daily digest** (08:00 UTC) emails opted-in users their unread notifications from the last 24 hours.
- Due-date reminders are deliberately quiet: at most two per due date (entering the 24h window, and going overdue). Changing the due date re-arms them.

## Activity and attribution

Every mutation writes an activity entry — visible per-task in the detail panel and per-workspace on the home page. Stacks distinguishes **who kind of actor** did each thing:

- **Humans** — actions from the UI.
- **Agents** — actions through the MCP API. These are badged `via 🤖 <agent name>` using the token's display name and emoji (set when the token is created), in the activity feed, comment threads, and the home digest.
- **System / automations** — cron-generated events (reminders, SLA breaches) and automation runs. Automation actions carry a `via ⚡ automation` chip so they're never mistaken for the human who created the rule.

The task activity feed has a filter for exactly these buckets: **All / Humans / Agents / System**.

## Dashboards

`/[workspace]/dashboards` renders metric cards per board kind, computed live from open tasks:

| Kind | Metrics |
| --- | --- |
| CRM | Pipeline value by stage, pipeline by owner, deals closing this quarter |
| Support | Open tickets by severity, SLA breaches, average first-response time |
| Bugs | Open bugs by severity, average resolution time, reopened count |
| Roadmap | Initiatives by quarter, blocked initiatives |

## Import and export

**Import** (`/[workspace]/import`, admin-only, linked from settings):

- **CSV → contacts or tasks**: upload, map columns, preview a dry run, then import. Contact imports are idempotent — rows match existing contacts by external ID, then by email, and update instead of duplicating. Task imports run in chunks (1,000+ rows verified) with an optional "skip rows whose title already exists on the board" switch.
- **Trello board JSON**: a full board export imports as lists → columns, cards → tasks.

**Export**: `GET /api/export?workspaceId=…[&boardId=…]&format=csv|json` (signed-in session required). Archived items are excluded. The JSON format round-trips everything including sidecar fields; CSV is spreadsheet-friendly.
