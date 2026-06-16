import Link from "next/link";

import { NotifyEmailToggle } from "@/components/account/notify-email-toggle";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ProfileForm } from "./_components/profile-form";

export default async function ProfilePage() {
  const user = await requireUser();
  const me = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { name: true, email: true, image: true, notifyEmail: true },
  });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Profile</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          How you appear to teammates across your workspaces.
        </p>
      </div>

      <section className="border-border bg-card rounded-xl border p-4">
        <ProfileForm user={me} />
      </section>

      <section className="border-border bg-card rounded-xl border p-4">
        <h2 className="text-sm font-semibold">Notifications</h2>
        <p className="text-muted-foreground mt-1 mb-3 text-sm">
          Mentions and assignments always land in your inbox; opt in to also get
          them by email. The daily digest email follows the same setting.
        </p>
        <NotifyEmailToggle initialEnabled={me.notifyEmail} />
      </section>

      <section className="border-border bg-card rounded-xl border p-4">
        <h2 className="text-sm font-semibold">API tokens</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Personal access tokens let agents work your boards through the MCP
          server, each with its own scopes and identity.
        </p>
        <Link
          href="/account/tokens"
          className="text-primary mt-2 inline-block text-sm hover:underline"
        >
          Manage API tokens →
        </Link>
      </section>
    </div>
  );
}
