"use client";

import { toast } from "sonner";
import { KeyRoundIcon, TrashIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSyncedTransition } from "@/components/sync";
import { revokeWorkspaceToken } from "@/server/actions/api-tokens";

export interface WorkspaceTokenSummary {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  displayName: string | null;
  emoji: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  user: { name: string | null; email: string | null };
}

function statusOf(t: WorkspaceTokenSummary): "active" | "revoked" | "expired" {
  if (t.revokedAt) return "revoked";
  if (t.expiresAt && new Date(t.expiresAt) < new Date()) return "expired";
  return "active";
}

export function WorkspaceTokensSection({
  workspaceId,
  tokens,
}: {
  workspaceId: string;
  tokens: WorkspaceTokenSummary[];
}) {
  const { isPending, run } = useSyncedTransition();

  const onRevoke = async (token: WorkspaceTokenSummary) => {
    const owner = token.user.name ?? token.user.email ?? "its owner";
    if (
      !confirm(
        `Revoke "${token.name}"? Agents using it lose access immediately; only ${owner} can issue a replacement.`,
      )
    )
      return;
    const result = await run("revoke-workspace-token", () =>
      revokeWorkspaceToken({ workspaceId, tokenId: token.id }),
    );
    if (result?.revoked) toast.success("Token revoked");
  };

  return (
    <section className="mt-10">
      <h2 className="font-heading text-lg font-medium">Agent tokens</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        API tokens pinned to this workspace, across all members. Revoking one
        cuts the agent off immediately. Tokens without a workspace pin
        aren&rsquo;t listed — removing the member disables those, since every
        call re-checks the owner&rsquo;s role.
      </p>

      {tokens.length === 0 ? (
        <div className="bg-muted/30 text-muted-foreground mt-4 rounded-lg border border-dashed p-6 text-center text-sm">
          No tokens are pinned to this workspace.
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {tokens.map((t) => {
            const status = statusOf(t);
            return (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <KeyRoundIcon className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    <span className="font-medium">{t.name}</span>
                    {t.displayName ? (
                      <span className="text-muted-foreground ml-2 text-xs">
                        {t.emoji ?? "🤖"} {t.displayName}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {t.user.name ?? t.user.email ?? "Unknown member"} ·{" "}
                    <span className="font-mono">{t.tokenPrefix}…</span> · last
                    used{" "}
                    {t.lastUsedAt
                      ? new Date(t.lastUsedAt).toLocaleDateString()
                      : "never"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {t.scopes.length === 0 ? (
                    <Badge
                      variant="outline"
                      className="border-amber-500/50 text-amber-700 dark:text-amber-400"
                      title="Created before token scoping — full access until rotated."
                    >
                      full access
                    </Badge>
                  ) : (
                    t.scopes.map((s) => (
                      <Badge key={s} variant="secondary">
                        {s}
                      </Badge>
                    ))
                  )}
                </div>
                {status === "active" ? (
                  <Badge variant="secondary">Active</Badge>
                ) : (
                  <Badge variant="outline">
                    {status === "revoked" ? "Revoked" : "Expired"}
                  </Badge>
                )}
                {status === "active" ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Revoke ${t.name}`}
                    loading={isPending}
                    onClick={() => onRevoke(t)}
                  >
                    <TrashIcon />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
