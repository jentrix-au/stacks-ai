import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getWorkspaceBySlug } from "@/server/queries/workspaces";
import { Role } from "@prisma/client";
import { WorkspaceSettingsForm } from "@/components/workspace/workspace-settings-form";
import { WebhooksSection } from "@/components/workspace/webhooks-section";
import { WorkspaceTokensSection } from "@/components/workspace/workspace-tokens-section";
import { listWorkspaceTokens } from "@/server/actions/api-tokens";
import * as webhookOps from "@/server/webhooks/operations";

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const [session, { workspaceSlug }] = await Promise.all([auth(), params]);
  if (!session?.user?.id) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspaceSlug, session.user.id);
  const myRole = workspace.members[0]?.role ?? Role.MEMBER;
  const canEdit = myRole === Role.OWNER || myRole === Role.ADMIN;

  const [webhooks, workspaceTokens] = canEdit
    ? await Promise.all([
        webhookOps
          .listWebhooks(session.user.id, { workspaceId: workspace.id })
          .then((r) => r.webhooks),
        listWorkspaceTokens({ workspaceId: workspace.id }),
      ])
    : [[], []];

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        Workspace settings
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Manage how {workspace.name} works.
      </p>

      <div className="mt-8">
        <WorkspaceSettingsForm
          workspace={{
            id: workspace.id,
            name: workspace.name,
            slug: workspace.slug,
          }}
          canEdit={canEdit}
        />
      </div>

      {canEdit ? (
        <WebhooksSection workspaceId={workspace.id} webhooks={webhooks} />
      ) : null}

      {canEdit ? (
        <WorkspaceTokensSection
          workspaceId={workspace.id}
          tokens={workspaceTokens}
        />
      ) : null}

      <section className="border-border bg-card mt-6 rounded-xl border p-4">
        <h2 className="text-sm font-semibold">API tokens</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Personal access tokens let agents (Claude Code, claude.ai, Codex) work
          your boards through the MCP server. Tokens are yours, not the
          workspace&rsquo;s — manage them from your account.
        </p>
        <Link
          href="/account/tokens"
          className="text-primary mt-2 inline-block text-sm hover:underline"
        >
          Manage API tokens →
        </Link>
      </section>

      <section className="border-border bg-card mt-6 rounded-xl border p-4">
        <h2 className="text-sm font-semibold">Import &amp; export</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          CSV imports for people and tasks, Trello board import, and CSV/JSON
          exports.
        </p>
        <Link
          href={`/${workspace.slug}/import`}
          className="text-primary mt-2 inline-block text-sm hover:underline"
        >
          Open import &amp; export →
        </Link>
      </section>
    </main>
  );
}
