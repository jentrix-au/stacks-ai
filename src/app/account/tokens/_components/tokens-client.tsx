"use client";

import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { CopyIcon, KeyIcon, PlusIcon, TrashIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSyncedTransition } from "@/components/sync";
import {
  TOKEN_SCOPES,
  TOKEN_SCOPE_DESCRIPTIONS,
  isGrandfathered,
  type TokenScope,
} from "@/lib/token-scopes";
import { createApiToken, revokeApiToken } from "@/server/actions/api-tokens";

export interface TokenSummary {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  workspace: { id: string; name: string } | null;
  displayName: string | null;
  emoji: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  usage7d: { requests: number; mutations: number };
  recentActions: { type: string; createdAt: string; taskKey: string }[];
}

export interface WorkspaceOption {
  id: string;
  name: string;
}

interface CreatedToken {
  id: string;
  name: string;
  tokenPrefix: string;
  expiresAt: string | null;
  token: string;
}

const ALL_WORKSPACES = "__all__";

function tokenStatus(t: TokenSummary): {
  label: string;
  className: string;
} {
  if (t.revokedAt)
    return { label: "Revoked", className: "text-muted-foreground" };
  if (t.expiresAt && new Date(t.expiresAt).getTime() < Date.now())
    return { label: "Expired", className: "text-muted-foreground" };
  return {
    label: "Active",
    className: "text-emerald-600 dark:text-emerald-400",
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  // Stable, locale-independent format so SSR and CSR agree.
  return format(new Date(iso), "MMM d, yyyy 'at' h:mm a");
}

function formatDay(iso: string): string {
  return format(new Date(iso), "MMM d, yyyy");
}

/** Compact two-line date for table cells; full date-time in the tooltip. */
function DateCell({ iso }: { iso: string | null }) {
  if (!iso) return <>—</>;
  return (
    <span className="block whitespace-nowrap" title={formatDate(iso)}>
      {formatDay(iso)}
      <span className="block text-[11px] opacity-70">
        {format(new Date(iso), "h:mm a")}
      </span>
    </span>
  );
}

export function TokensClient({
  tokens,
  workspaces,
}: {
  tokens: TokenSummary[];
  workspaces: WorkspaceOption[];
}) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<CreatedToken | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base font-medium">Your tokens</h2>
        <Button
          onClick={() => {
            setCreated(null);
            setOpen(true);
          }}
        >
          <PlusIcon />
          New token
        </Button>
      </div>

      {tokens.length === 0 ? (
        <div className="bg-muted/30 text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          No tokens yet. Create one to connect an agent.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-2.5 py-2 font-medium whitespace-nowrap">
                  Name
                </th>
                <th className="px-2.5 py-2 font-medium whitespace-nowrap">
                  Prefix
                </th>
                <th className="px-2.5 py-2 font-medium whitespace-nowrap">
                  Scopes
                </th>
                <th className="px-2.5 py-2 font-medium whitespace-nowrap">
                  Workspace
                </th>
                <th className="px-2.5 py-2 font-medium whitespace-nowrap">
                  Usage (7d)
                </th>
                <th className="px-2.5 py-2 font-medium whitespace-nowrap">
                  Last used
                </th>
                <th className="px-2.5 py-2 font-medium whitespace-nowrap">
                  Expires
                </th>
                <th className="px-2.5 py-2 font-medium whitespace-nowrap">
                  Status
                </th>
                <th className="px-2.5 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <TokenRow key={t.id} token={t} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {created ? (
            <CreatedTokenView
              created={created}
              onClose={() => setOpen(false)}
            />
          ) : (
            <CreateTokenForm
              workspaces={workspaces}
              onCreated={(c) => setCreated(c)}
              onCancel={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScopeBadges({ scopes }: { scopes: string[] }) {
  if (isGrandfathered(scopes)) {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/50 text-amber-700 dark:text-amber-400"
        title="Created before scopes existed — full access. Rotate it to scope it down."
      >
        Full access (legacy)
      </Badge>
    );
  }
  return (
    <span className="flex flex-wrap gap-1">
      {scopes.map((s) => (
        <Badge key={s} variant="secondary" className="font-mono text-[11px]">
          {s}
        </Badge>
      ))}
    </span>
  );
}

function TokenRow({ token }: { token: TokenSummary }) {
  const { isPending, run } = useSyncedTransition();
  const status = tokenStatus(token);
  const canRevoke = !token.revokedAt;

  const onRevoke = async () => {
    if (!canRevoke) return;
    if (!confirm(`Revoke token "${token.name}"? This cannot be undone.`))
      return;
    const result = await run("revoke-token", () => revokeApiToken(token.id));
    if (!result) return;
    if (result.revoked) toast.success("Token revoked");
    else toast.error("Token already revoked or not found");
  };

  return (
    <tr className="border-t">
      <td className="px-2.5 py-2">
        <div className="flex items-center gap-2">
          <KeyIcon className="text-muted-foreground size-3.5" />
          {token.name}
          {token.displayName ? (
            <span
              className="text-muted-foreground bg-muted rounded px-1 py-px text-[10px]"
              title="Agent identity shown on attribution badges"
            >
              {token.emoji ?? "🤖"} {token.displayName}
            </span>
          ) : null}
        </div>
        {token.recentActions.length > 0 ? (
          <p
            className="text-muted-foreground mt-0.5 max-w-56 text-[11px]"
            title={formatDate(token.recentActions[0].createdAt)}
          >
            Last: {token.recentActions[0].type.toLowerCase()} on{" "}
            {token.recentActions[0].taskKey} (
            {formatDay(token.recentActions[0].createdAt)})
          </p>
        ) : null}
      </td>
      <td className="text-muted-foreground px-2.5 py-2 font-mono text-xs">
        {token.tokenPrefix}…
      </td>
      <td className="px-2.5 py-2">
        <ScopeBadges scopes={token.scopes} />
      </td>
      <td className="text-muted-foreground px-2.5 py-2">
        <span className="block max-w-32 truncate" title={token.workspace?.name}>
          {token.workspace ? token.workspace.name : "All"}
        </span>
      </td>
      <td
        className="text-muted-foreground px-2.5 py-2 text-xs whitespace-nowrap"
        data-testid="token-usage"
      >
        {token.usage7d.requests} req · {token.usage7d.mutations} mut
      </td>
      <td className="text-muted-foreground px-2.5 py-2 text-xs">
        <DateCell iso={token.lastUsedAt} />
      </td>
      <td className="text-muted-foreground px-2.5 py-2 text-xs">
        <DateCell iso={token.expiresAt} />
      </td>
      <td className={`px-2.5 py-2 whitespace-nowrap ${status.className}`}>
        {status.label}
      </td>
      <td className="px-2.5 py-2 text-right">
        {canRevoke ? (
          <Button
            variant="ghost"
            size="icon-sm"
            loading={isPending}
            onClick={onRevoke}
            aria-label="Revoke token"
          >
            <TrashIcon />
          </Button>
        ) : null}
      </td>
    </tr>
  );
}

function CreateTokenForm({
  workspaces,
  onCreated,
  onCancel,
}: {
  workspaces: WorkspaceOption[];
  onCreated: (c: CreatedToken) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [scopes, setScopes] = useState<TokenScope[]>(["read", "write"]);
  const [workspaceId, setWorkspaceId] = useState<string>(ALL_WORKSPACES);
  const { isPending, run } = useSyncedTransition();

  const toggleScope = (scope: TokenScope, on: boolean) => {
    setScopes((prev) =>
      on
        ? TOKEN_SCOPES.filter((s) => prev.includes(s) || s === scope)
        : prev.filter((s) => s !== scope),
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (scopes.length === 0) return;
    const created = await run("create-token", () =>
      createApiToken({
        name: name.trim(),
        expiresInDays: Number(expiresInDays),
        scopes,
        workspaceId: workspaceId === ALL_WORKSPACES ? null : workspaceId,
        displayName: displayName.trim() || null,
        emoji: emoji.trim() || null,
      }),
    );
    if (created) onCreated(created);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>New API token</DialogTitle>
        <DialogDescription>
          Used to authenticate the MCP server. You&apos;ll see the full token
          once after creation — copy it then.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <Label htmlFor="token-name">Name</Label>
        <Input
          id="token-name"
          placeholder="Claude Desktop on Mac"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={80}
        />
      </div>

      <div className="grid grid-cols-[1fr_5rem] gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="token-display-name">Agent name (optional)</Label>
          <Input
            id="token-display-name"
            placeholder="Triage Bot"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={80}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="token-emoji">Emoji</Label>
          <Input
            id="token-emoji"
            placeholder="🤖"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            maxLength={16}
          />
        </div>
        <p className="text-muted-foreground col-span-2 -mt-1 text-xs">
          Shown as the agent&apos;s identity on activity and comment badges.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Scopes</Label>
        <div className="flex flex-col gap-2">
          {TOKEN_SCOPES.map((scope) => (
            <label
              key={scope}
              className="flex cursor-pointer items-start gap-2 text-sm"
            >
              <Checkbox
                checked={scopes.includes(scope)}
                onCheckedChange={(v) => toggleScope(scope, !!v)}
                aria-label={`Scope: ${scope}`}
              />
              <span className="flex flex-col">
                <span className="font-mono text-xs font-medium">{scope}</span>
                <span className="text-muted-foreground text-xs">
                  {TOKEN_SCOPE_DESCRIPTIONS[scope]}
                </span>
              </span>
            </label>
          ))}
        </div>
        {scopes.length === 0 ? (
          <p className="text-destructive text-xs">Select at least one scope.</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Workspace</Label>
        <Select
          value={workspaceId}
          onValueChange={(v) => setWorkspaceId(v as string)}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {(value: string | null) =>
                value === ALL_WORKSPACES || !value
                  ? "All my workspaces"
                  : (workspaces.find((w) => w.id === value)?.name ?? value)
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_WORKSPACES}>All my workspaces</SelectItem>
            {workspaces.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          Restrict the token to one workspace — calls outside it are rejected.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="token-expires">Expires in (days)</Label>
        <Input
          id="token-expires"
          type="number"
          min={1}
          max={365}
          value={expiresInDays}
          onChange={(e) => setExpiresInDays(e.target.value)}
          required
        />
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          type="button"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!name.trim() || scopes.length === 0}
          loading={isPending}
          loadingText="Creating…"
        >
          Create token
        </Button>
      </DialogFooter>
    </form>
  );
}

function CreatedTokenView({
  created,
  onClose,
}: {
  created: CreatedToken;
  onClose: () => void;
}) {
  const copy = async () => {
    await navigator.clipboard.writeText(created.token);
    toast.success("Token copied to clipboard");
  };

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Token created</DialogTitle>
        <DialogDescription>
          Copy this token now. For your security it won&apos;t be shown again.
        </DialogDescription>
      </DialogHeader>

      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
        Treat this like a password. Anyone with it can act on your tasks via the
        MCP server, within the scopes you selected.
      </div>

      <div className="bg-muted/50 flex items-center gap-2 rounded-md border px-3 py-2 font-mono text-xs break-all">
        <span className="flex-1">{created.token}</span>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={copy}
          aria-label="Copy token"
        >
          <CopyIcon />
        </Button>
      </div>

      <details className="text-muted-foreground text-xs">
        <summary className="cursor-pointer select-none">
          How to use this token
        </summary>
        <pre className="bg-muted mt-2 overflow-x-auto rounded-md p-3 text-[11px]">
          {`# Claude Code
claude mcp add --transport http task-manager \\
  ${typeof window !== "undefined" ? window.location.origin : ""}/api/mcp \\
  --header "Authorization: Bearer ${created.token}"

# Claude Desktop (mcpServers)
{
  "task-manager": {
    "command": "npx",
    "args": ["-y", "mcp-remote",
      "${typeof window !== "undefined" ? window.location.origin : ""}/api/mcp",
      "--header", "Authorization:Bearer \${MCP_TOKEN}"],
    "env": { "MCP_TOKEN": "${created.token}" }
  }
}`}
        </pre>
      </details>

      <DialogFooter>
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </div>
  );
}
