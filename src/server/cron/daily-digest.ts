import { db } from "@/lib/db";
import { sendNotificationEmail } from "@/lib/email";

/**
 * Daily digest email (deferred from P3.3 to the cron phase): one email per
 * opted-in user summarizing their UNREAD notifications from the last 24h,
 * grouped by workspace. Clock injected for tests.
 */

export interface DigestItem {
  type: string;
  taskKey: string | null;
  taskTitle: string | null;
  actorName: string | null;
}

export interface WorkspaceDigest {
  workspaceName: string;
  workspaceSlug: string;
  items: DigestItem[];
}

const TYPE_LABEL: Record<string, string> = {
  assigned: "assigned you",
  mentioned: "mentioned you on",
  commented: "commented on",
  due_soon: "due soon",
  sla_breached: "SLA breached",
};

/** Pure: one digest email body per user. */
export function buildDigestText(
  name: string | null,
  workspaces: WorkspaceDigest[],
): string {
  const lines: string[] = [
    `Hi${name ? ` ${name}` : ""} — here's what you missed in the last day:`,
    "",
  ];
  for (const ws of workspaces) {
    lines.push(`${ws.workspaceName} (${ws.items.length}):`);
    for (const item of ws.items.slice(0, 10)) {
      const actor = item.actorName ?? "System";
      const verb = TYPE_LABEL[item.type] ?? item.type.replace(/_/g, " ");
      lines.push(
        `  • ${actor} ${verb} ${item.taskKey ?? ""} ${item.taskTitle ?? ""}`.trimEnd(),
      );
    }
    if (ws.items.length > 10)
      lines.push(`  … and ${ws.items.length - 10} more.`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export async function runDailyDigest(
  now: Date = new Date(),
): Promise<{ emailsSent: number }> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const users = await db.user.findMany({
    where: {
      notifyEmail: true,
      notifications: { some: { readAt: null, createdAt: { gte: since } } },
    },
    select: {
      id: true,
      name: true,
      email: true,
      notifications: {
        where: { readAt: null, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        select: {
          type: true,
          payload: true,
          workspace: { select: { name: true, slug: true } },
        },
      },
    },
  });

  let emailsSent = 0;
  for (const user of users) {
    const byWorkspace = new Map<string, WorkspaceDigest>();
    for (const n of user.notifications) {
      const p = (n.payload ?? {}) as {
        actorName?: string | null;
        taskKey?: string;
        taskTitle?: string;
      };
      const entry = byWorkspace.get(n.workspace.slug) ?? {
        workspaceName: n.workspace.name,
        workspaceSlug: n.workspace.slug,
        items: [],
      };
      entry.items.push({
        type: n.type,
        taskKey: p.taskKey ?? null,
        taskTitle: p.taskTitle ?? null,
        actorName: p.actorName ?? null,
      });
      byWorkspace.set(n.workspace.slug, entry);
    }
    const workspaces = [...byWorkspace.values()];
    const total = workspaces.reduce((sum, w) => sum + w.items.length, 0);
    const first = workspaces[0];
    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    ).replace(/\/$/, "");
    await sendNotificationEmail({
      to: user.email,
      subject: `Stacks digest — ${total} unread notification${total === 1 ? "" : "s"}`,
      text: buildDigestText(user.name, workspaces),
      link: `${appUrl}/${first.workspaceSlug}/inbox`,
    });
    emailsSent += 1;
  }
  return { emailsSent };
}
