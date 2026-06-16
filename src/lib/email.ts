import { Resend } from "resend";

let _client: Resend | null = null;

function client(): Resend | null {
  if (_client) return _client;
  const key = process.env.AUTH_RESEND_KEY;
  if (!key) return null;
  _client = new Resend(key);
  return _client;
}

function fromAddress(): string {
  return process.env.RESEND_FROM ?? "noreply@example.com";
}

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.AUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export type InvitationEmailInput = {
  to: string;
  workspaceName: string;
  inviterName: string | null;
  role: string;
  token: string;
};

export async function sendInvitationEmail(input: InvitationEmailInput) {
  const resend = client();
  if (!resend) {
    console.warn(
      "[email] AUTH_RESEND_KEY not set — skipping invitation email to",
      input.to,
    );
    return { sent: false as const };
  }

  const link = `${appBaseUrl()}/invite/${input.token}`;
  const inviter = input.inviterName?.trim() || "A teammate";
  const subject = `${inviter} invited you to join ${input.workspaceName}`;

  const text = [
    `${inviter} invited you to join the "${input.workspaceName}" workspace as ${input.role.toLowerCase()}.`,
    "",
    `Accept the invitation: ${link}`,
    "",
    "If you weren't expecting this, you can safely ignore the email.",
  ].join("\n");

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
  <h2 style="margin:0 0 12px;font-size:18px;font-weight:600">You've been invited</h2>
  <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#333">
    <strong>${escapeHtml(inviter)}</strong> invited you to join
    the <strong>${escapeHtml(input.workspaceName)}</strong> workspace
    as <strong>${escapeHtml(input.role.toLowerCase())}</strong>.
  </p>
  <p style="margin:0 0 24px">
    <a href="${link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:500">Accept invitation</a>
  </p>
  <p style="margin:0;font-size:12px;color:#666;line-height:1.5">
    Or paste this link into your browser:<br/>
    <span style="word-break:break-all">${link}</span>
  </p>
</div>`.trim();

  try {
    const res = await resend.emails.send({
      from: fromAddress(),
      to: input.to,
      subject,
      text,
      html,
    });
    if (res.error) {
      console.error("[email] resend rejected invitation", res.error);
      return { sent: false as const, error: res.error.message };
    }
    return { sent: true as const, id: res.data?.id };
  } catch (err) {
    console.error("[email] failed to send invitation", err);
    return {
      sent: false as const,
      error: err instanceof Error ? err.message : "send failed",
    };
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Notification emails (P3.3): immediate sends for mention/assign. Same
// no-op-without-keys behavior as invitations. The transport is injectable so
// unit tests can assert sends without Resend.
// ---------------------------------------------------------------------------

export type NotificationEmailInput = {
  to: string;
  subject: string;
  text: string;
  link: string;
};

type NotificationEmailSender = (
  input: NotificationEmailInput,
) => Promise<void>;

let testNotificationSender: NotificationEmailSender | null = null;

export function setNotificationEmailSenderForTesting(
  sender: NotificationEmailSender | null,
): void {
  testNotificationSender = sender;
}

export function notificationLink(
  workspaceSlug: string,
  boardSlug: string,
  taskId: string,
): string {
  return `${appBaseUrl()}/${workspaceSlug}/board/${boardSlug}?task=${taskId}`;
}

export async function sendNotificationEmail(input: NotificationEmailInput) {
  if (testNotificationSender) {
    await testNotificationSender(input);
    return { sent: true as const };
  }
  const resend = client();
  if (!resend) {
    console.warn(
      "[email] AUTH_RESEND_KEY not set — skipping notification email to",
      input.to,
    );
    return { sent: false as const };
  }

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
  <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#333">${escapeHtml(input.text)}</p>
  <p style="margin:0 0 24px">
    <a href="${input.link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:500">Open task</a>
  </p>
  <p style="margin:0;font-size:12px;color:#666;line-height:1.5">
    You can turn these emails off from your inbox page in Stacks.
  </p>
</div>`.trim();

  try {
    const res = await resend.emails.send({
      from: fromAddress(),
      to: input.to,
      subject: input.subject,
      text: `${input.text}\n\n${input.link}`,
      html,
    });
    if (res.error) {
      console.error("[email] resend rejected notification", res.error);
      return { sent: false as const, error: res.error.message };
    }
    return { sent: true as const, id: res.data?.id };
  } catch (err) {
    console.error("[email] failed to send notification", err);
    return {
      sent: false as const,
      error: err instanceof Error ? err.message : "send failed",
    };
  }
}
