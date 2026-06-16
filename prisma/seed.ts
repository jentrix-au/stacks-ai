import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { createHash, randomBytes } from "node:crypto";

import {
  BoardKind,
  BugSeverity,
  InitiativeConfidence,
  PrismaClient,
  Priority,
  Role,
  TaskLinkKind,
  TicketSeverity,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { POSITION_STEP } from "../src/lib/position";
import { taskPrefixFromSlug } from "../src/lib/slug";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local.");
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});

async function main() {
  const demoEmail = "demo@stacks.local";

  // Idempotent reset of the demo workspace so re-running seed is safe.
  await db.workspaceMember.deleteMany({
    where: { workspace: { slug: "demo" } },
  });
  await db.workspace.deleteMany({ where: { slug: "demo" } });

  const user = await db.user.upsert({
    where: { email: demoEmail },
    create: {
      email: demoEmail,
      name: "Demo User",
      emailVerified: new Date(),
    },
    update: { name: "Demo User" },
  });

  // Second member so cross-user flows (mentions, watcher notifications,
  // assignments) are demonstrable — e2e signs in as either user.
  const teammate = await db.user.upsert({
    where: { email: "casey@stacks.local" },
    create: {
      email: "casey@stacks.local",
      name: "Casey Teammate",
      emailVerified: new Date(),
    },
    update: { name: "Casey Teammate" },
  });

  const workspace = await db.workspace.create({
    data: {
      name: "Acme Inc.",
      slug: "demo",
      taskPrefix: taskPrefixFromSlug("demo"),
      members: {
        create: [
          { userId: user.id, role: Role.OWNER },
          { userId: teammate.id, role: Role.MEMBER },
        ],
      },
    },
  });

  const board = await db.board.create({
    data: {
      workspaceId: workspace.id,
      name: "Product roadmap",
      slug: "roadmap",
      labels: {
        create: [
          { name: "bug", color: "#ef4444" },
          { name: "feature", color: "#3b82f6" },
          { name: "polish", color: "#a855f7" },
          { name: "blocked", color: "#f59e0b" },
        ],
      },
    },
    include: { labels: true },
  });

  const columns = await Promise.all(
    ["Backlog", "In progress", "In review", "Done"].map((name, i) =>
      db.column.create({
        data: {
          boardId: board.id,
          name,
          position: (i + 1) * POSITION_STEP,
        },
      }),
    ),
  );

  const sampleTasks: Array<{
    column: string;
    title: string;
    description?: string;
    priority?: Priority;
    label?: string;
  }> = [
    {
      column: "Backlog",
      title: "Onboarding flow polish",
      description: "Tighten the empty states and add a Lottie animation.",
      label: "polish",
    },
    {
      column: "Backlog",
      title: "Mobile drag-and-drop QA",
      description: "Test on iOS Safari + Android Chrome.",
      priority: Priority.HIGH,
    },
    {
      column: "In progress",
      title: "Realtime presence avatars",
      description: "Show who's currently on the board.",
      priority: Priority.MEDIUM,
      label: "feature",
    },
    {
      column: "In review",
      title: "R2 presigned uploads",
      description: "Move attachments off the server runtime.",
      priority: Priority.HIGH,
      label: "feature",
    },
    {
      column: "Done",
      title: "Initial schema",
      description: "Define workspaces, boards, columns, tasks, labels.",
      priority: Priority.LOW,
    },
  ];

  for (const [i, t] of sampleTasks.entries()) {
    const col = columns.find((c) => c.name === t.column)!;
    const label = t.label ? board.labels.find((l) => l.name === t.label) : null;
    await db.task.create({
      data: {
        columnId: col.id,
        workspaceId: workspace.id,
        number: i + 1,
        title: t.title,
        description: t.description,
        position: (i + 1) * POSITION_STEP,
        priority: t.priority ?? Priority.MEDIUM,
        createdById: user.id,
        labels: label ? { create: { labelId: label.id } } : undefined,
        assignees: { create: { userId: user.id } },
      },
    });
  }

  // --- Cross-kind demo: a BUGS board and a CRM board, with a bug that
  // blocks a deal (exercises the universal TaskLink graph end-to-end).
  let nextNumber = sampleTasks.length + 1;

  const bugsBoard = await db.board.create({
    data: {
      workspaceId: workspace.id,
      name: "Bug tracker",
      slug: "bugs",
      kind: BoardKind.BUGS,
    },
  });
  const bugsColumns = await Promise.all(
    ["Inbox", "Confirmed", "Fixed"].map((name, i) =>
      db.column.create({
        data: {
          boardId: bugsBoard.id,
          name,
          position: (i + 1) * POSITION_STEP,
        },
      }),
    ),
  );
  const bugTask = await db.task.create({
    data: {
      columnId: bugsColumns[1].id,
      workspaceId: workspace.id,
      number: nextNumber++,
      title: "Checkout crashes on invalid card",
      description: "Payment form throws on submit with an expired card.",
      position: POSITION_STEP,
      priority: Priority.URGENT,
      createdById: user.id,
      bugReport: { create: { severity: BugSeverity.CRITICAL } },
    },
  });

  const crmBoard = await db.board.create({
    data: {
      workspaceId: workspace.id,
      name: "Sales pipeline",
      slug: "pipeline",
      kind: BoardKind.CRM,
    },
  });
  const crmColumns = await Promise.all(
    ["Lead", "Negotiation", "Won"].map((name, i) =>
      db.column.create({
        data: {
          boardId: crmBoard.id,
          name,
          position: (i + 1) * POSITION_STEP,
        },
      }),
    ),
  );
  const dealTask = await db.task.create({
    data: {
      columnId: crmColumns[1].id,
      workspaceId: workspace.id,
      number: nextNumber++,
      title: "Globex annual contract",
      position: POSITION_STEP,
      priority: Priority.HIGH,
      createdById: user.id,
      deal: { create: { amount: 48_000, currency: "USD" } },
    },
  });

  // The bug blocks the deal — a cross-kind, cross-board link.
  await db.taskLink.create({
    data: {
      fromTaskId: bugTask.id,
      toTaskId: dealTask.id,
      kind: TaskLinkKind.BLOCKS,
      createdById: user.id,
    },
  });

  // --- One party directory: the same person is a contact on the deal AND
  // the requester on a support ticket.
  const contact = await db.contact.create({
    data: {
      workspaceId: workspace.id,
      name: "Dana Reyes",
      email: "dana@globex.com",
      company: "Globex",
      createdById: user.id,
    },
  });
  const deal = await db.deal.findUniqueOrThrow({
    where: { taskId: dealTask.id },
    select: { id: true },
  });
  await db.dealContact.create({
    data: { dealId: deal.id, contactId: contact.id },
  });

  const supportBoard = await db.board.create({
    data: {
      workspaceId: workspace.id,
      name: "Support desk",
      slug: "support",
      kind: BoardKind.SUPPORT,
    },
  });
  const supportColumns = await Promise.all(
    ["New", "In progress", "Resolved"].map((name, i) =>
      db.column.create({
        data: {
          boardId: supportBoard.id,
          name,
          position: (i + 1) * POSITION_STEP,
        },
      }),
    ),
  );
  await db.task.create({
    data: {
      columnId: supportColumns[0].id,
      workspaceId: workspace.id,
      number: nextNumber++,
      title: "Cannot download invoices",
      position: POSITION_STEP,
      priority: Priority.MEDIUM,
      createdById: user.id,
      ticket: {
        create: {
          severity: TicketSeverity.HIGH,
          contactId: contact.id,
          source: "email",
        },
      },
    },
  });

  // --- ROADMAP board with an initiative the bug also blocks (cross-kind
  // dependency graph across three boards).
  const roadmapBoard = await db.board.create({
    data: {
      workspaceId: workspace.id,
      name: "Roadmap 2026",
      slug: "initiatives",
      kind: BoardKind.ROADMAP,
    },
  });
  const roadmapColumns = await Promise.all(
    ["Discovery", "In build", "Shipped"].map((name, i) =>
      db.column.create({
        data: {
          boardId: roadmapBoard.id,
          name,
          position: (i + 1) * POSITION_STEP,
        },
      }),
    ),
  );
  const initiativeTask = await db.task.create({
    data: {
      columnId: roadmapColumns[1].id,
      workspaceId: workspace.id,
      number: nextNumber++,
      title: "Self-serve billing",
      description: "Customers manage plans and invoices without support.",
      position: POSITION_STEP,
      priority: Priority.HIGH,
      createdById: user.id,
      initiative: {
        create: {
          targetQuarter: "2026-Q3",
          confidence: InitiativeConfidence.MEDIUM,
          effortEstimate: "L",
        },
      },
    },
  });
  await db.taskLink.create({
    data: {
      fromTaskId: bugTask.id,
      toTaskId: initiativeTask.id,
      kind: TaskLinkKind.BLOCKS,
      createdById: user.id,
    },
  });

  // Counter continues after the highest seeded number.
  await db.workspaceCounter.create({
    data: { workspaceId: workspace.id, nextTaskNumber: nextNumber },
  });

  // Watchers + a notification (P3.3): Casey watches the seeded bug, so a
  // comment on it notifies them; demo user has one unread notification to
  // showcase the bell + inbox.
  await db.taskWatcher.createMany({
    data: [
      { taskId: bugTask.id, userId: teammate.id },
      { taskId: bugTask.id, userId: user.id },
    ],
    skipDuplicates: true,
  });
  await db.notification.create({
    data: {
      userId: user.id,
      workspaceId: workspace.id,
      taskId: bugTask.id,
      type: "assigned",
      payload: {
        actorName: teammate.name,
        taskKey: `${workspace.taskPrefix}-${bugTask.number}`,
        taskTitle: bugTask.title,
        boardSlug: "bugs",
      },
    },
  });

  // Shared saved view (P3.4) on the main board: high-priority work first.
  await db.savedView.create({
    data: {
      boardId: board.id,
      name: "High priority",
      filters: {
        labels: [],
        assignees: [],
        priorities: [Priority.HIGH, Priority.URGENT],
        due: null,
        sort: "priority",
      },
      shared: true,
      createdById: user.id,
    },
  });

  // Sample automation rule (P3.7) — DISABLED so seeded data never mutates
  // itself; demonstrates the model + the board Automations dialog.
  await db.automationRule.create({
    data: {
      workspaceId: workspace.id,
      boardId: board.id,
      name: "Moved to Done → low priority (sample)",
      enabled: false,
      trigger: {
        type: "task.moved_to_column",
        columnId: columns.find((c) => c.name === "Done")!.id,
      },
      conditions: {},
      actions: [{ type: "set_priority", priority: "LOW" }],
      createdById: user.id,
    },
  });

  // Demo API token with an agent identity (P4.1) — shows the displayName/
  // emoji chip on /account/tokens. The plaintext token is random and
  // discarded, so the row can never authenticate anything.
  await db.apiToken.deleteMany({
    where: { userId: user.id, name: "Demo agent token" },
  });
  await db.apiToken.create({
    data: {
      userId: user.id,
      name: "Demo agent token",
      tokenHash: createHash("sha256")
        .update(randomBytes(24).toString("base64url"))
        .digest("hex"),
      tokenPrefix: "tm_demo_seed",
      scopes: ["read", "write"],
      workspaceId: workspace.id,
      displayName: "Triage Bot",
      emoji: "🛠️",
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  // Demo webhook — INACTIVE so the seed never generates outbound traffic.
  // Demonstrates the model + settings UI; activate by recreating with a
  // real endpoint.
  await db.webhook.create({
    data: {
      workspaceId: workspace.id,
      url: "https://example.com/stacks-webhook-demo",
      secret: "whsec_demo_not_a_real_secret",
      events: ["task.created", "task.moved"],
      active: false,
      createdById: user.id,
    },
  });

  console.log(
    `Seeded workspace "${workspace.name}" (/${workspace.slug}) with boards "${board.name}", "${bugsBoard.name}", "${crmBoard.name}", "${supportBoard.name}", "${roadmapBoard.name}" and ${nextNumber - 1} tasks.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
