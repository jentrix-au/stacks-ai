import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findManyUsers } = vi.hoisted(() => ({ findManyUsers: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: { user: { findMany: findManyUsers } } }));

import {
  setNotificationEmailSenderForTesting,
  type NotificationEmailInput,
} from "@/lib/email";
import { buildDigestText, runDailyDigest } from "./daily-digest";

const NOW = new Date("2026-06-12T08:00:00Z");

describe("buildDigestText", () => {
  it("groups items per workspace with actor + verb + task key", () => {
    const text = buildDigestText("Casey", [
      {
        workspaceName: "Acme Inc.",
        workspaceSlug: "demo",
        items: [
          {
            type: "mentioned",
            taskKey: "DEM-6",
            taskTitle: "Checkout crashes",
            actorName: "Demo User",
          },
          {
            type: "sla_breached",
            taskKey: "DEM-8",
            taskTitle: "Cannot download invoices",
            actorName: null,
          },
        ],
      },
    ]);
    expect(text).toContain("Hi Casey");
    expect(text).toContain("Acme Inc. (2):");
    expect(text).toContain("Demo User mentioned you on DEM-6");
    expect(text).toContain("System SLA breached DEM-8");
  });
});

describe("runDailyDigest (injected clock)", () => {
  const sent: NotificationEmailInput[] = [];

  beforeEach(() => {
    sent.length = 0;
    findManyUsers.mockReset();
    setNotificationEmailSenderForTesting(async (input) => {
      sent.push(input);
    });
  });

  afterEach(() => setNotificationEmailSenderForTesting(null));

  it("queries opted-in users with unread notifications in the last 24h and emails each once", async () => {
    findManyUsers.mockResolvedValue([
      {
        id: "u1",
        name: "Casey",
        email: "casey@stacks.local",
        notifications: [
          {
            type: "assigned",
            payload: {
              actorName: "Demo User",
              taskKey: "DEM-2",
              taskTitle: "Mobile QA",
            },
            workspace: { name: "Acme Inc.", slug: "demo" },
          },
        ],
      },
    ]);

    const { emailsSent } = await runDailyDigest(NOW);
    expect(emailsSent).toBe(1);

    // The 24h window comes from the injected clock.
    const where = findManyUsers.mock.calls[0][0].where;
    expect(where.notifyEmail).toBe(true);
    expect(where.notifications.some.createdAt.gte).toEqual(
      new Date("2026-06-11T08:00:00Z"),
    );

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("casey@stacks.local");
    expect(sent[0].subject).toContain("1 unread notification");
    expect(sent[0].text).toContain("Demo User assigned you DEM-2");
    expect(sent[0].link).toContain("/demo/inbox");
  });

  it("sends nothing when nobody qualifies", async () => {
    findManyUsers.mockResolvedValue([]);
    const { emailsSent } = await runDailyDigest(NOW);
    expect(emailsSent).toBe(0);
    expect(sent).toHaveLength(0);
  });
});
