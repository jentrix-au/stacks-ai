import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findManyUsers, createManyNotifications } = vi.hoisted(() => ({
  findManyUsers: vi.fn(),
  createManyNotifications: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findMany: findManyUsers },
    notification: { createMany: createManyNotifications },
  },
}));

import {
  setNotificationEmailSenderForTesting,
  type NotificationEmailInput,
} from "@/lib/email";
import {
  createTaskNotifications,
  resolveCommentRecipients,
  sendNotificationEmailsNow,
  type TaskNotifyContext,
} from "./notifications";

const CTX: TaskNotifyContext = {
  workspaceId: "ws1",
  workspaceSlug: "demo",
  taskId: "t1",
  taskKey: "DEM-6",
  taskTitle: "Checkout crashes",
  boardId: "b1",
  boardSlug: "bugs",
  actorId: "author",
  actorName: "Demo User",
};

describe("resolveCommentRecipients", () => {
  it("mentions win over watcher status; the author gets nothing", () => {
    const out = resolveCommentRecipients({
      authorId: "author",
      mentions: ["casey", "author", "casey"],
      watchers: ["author", "casey", "watcher1", "watcher1"],
    });
    expect(out.mentioned).toEqual(["casey"]);
    expect(out.commented).toEqual(["watcher1"]);
  });

  it("no mentions → all watchers minus author get 'commented'", () => {
    const out = resolveCommentRecipients({
      authorId: "author",
      mentions: [],
      watchers: ["author", "a", "b"],
    });
    expect(out.mentioned).toEqual([]);
    expect(out.commented).toEqual(["a", "b"]);
  });
});

describe("createTaskNotifications", () => {
  beforeEach(() => createManyNotifications.mockReset());

  it("writes rows for everyone but the actor, with the display snapshot", async () => {
    createManyNotifications.mockResolvedValue({ count: 1 });
    const tx = { notification: { createMany: createManyNotifications } };
    const notified = await createTaskNotifications(
      tx as never,
      CTX,
      "mentioned",
      ["casey", "author", "casey"],
      "hello @Casey",
    );
    expect(notified).toEqual(["casey"]);
    const arg = createManyNotifications.mock.calls[0][0];
    expect(arg.data).toEqual([
      expect.objectContaining({
        userId: "casey",
        workspaceId: "ws1",
        taskId: "t1",
        type: "mentioned",
        payload: expect.objectContaining({
          actorName: "Demo User",
          taskKey: "DEM-6",
          boardSlug: "bugs",
          preview: "hello @Casey",
        }),
      }),
    ]);
  });

  it("is a no-op when only the actor would be notified", async () => {
    const tx = { notification: { createMany: createManyNotifications } };
    const notified = await createTaskNotifications(tx as never, CTX, "assigned", [
      "author",
    ]);
    expect(notified).toEqual([]);
    expect(createManyNotifications).not.toHaveBeenCalled();
  });
});

describe("sendNotificationEmailsNow", () => {
  const sent: NotificationEmailInput[] = [];

  beforeEach(() => {
    sent.length = 0;
    findManyUsers.mockReset();
    setNotificationEmailSenderForTesting(async (input) => {
      sent.push(input);
    });
  });

  afterEach(() => setNotificationEmailSenderForTesting(null));

  it("emails opted-in recipients with subject, body, and deep link", async () => {
    findManyUsers.mockResolvedValue([{ email: "casey@stacks.local" }]);
    await sendNotificationEmailsNow(CTX, "mentioned", ["casey"]);

    // The query filters to opted-in users (per-user toggle).
    expect(findManyUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["casey"] }, notifyEmail: true },
      }),
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("casey@stacks.local");
    expect(sent[0].subject).toContain("DEM-6");
    expect(sent[0].subject).toContain("mentioned you");
    expect(sent[0].link).toContain("/demo/board/bugs?task=t1");
  });

  it("only mention/assign types email — 'commented' stays in-app", async () => {
    await sendNotificationEmailsNow(CTX, "commented", ["casey"]);
    expect(findManyUsers).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });
});
