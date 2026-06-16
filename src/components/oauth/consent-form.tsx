"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSyncedTransition } from "@/components/sync";
import {
  TOKEN_SCOPE_DESCRIPTIONS,
  type TokenScope,
} from "@/lib/token-scopes";
import {
  approveAuthorization,
  denyAuthorization,
} from "@/server/actions/oauth";

const ALL_WORKSPACES = "__all__";

export function ConsentForm({
  client,
  redirectUri,
  requestedScopes,
  state,
  codeChallenge,
  workspaces,
  userEmail,
}: {
  client: { clientId: string; name: string; logoUri: string | null };
  redirectUri: string;
  requestedScopes: TokenScope[];
  state: string | null;
  codeChallenge: string;
  workspaces: { id: string; name: string }[];
  userEmail: string;
}) {
  const [scopes, setScopes] = useState<TokenScope[]>(requestedScopes);
  const [workspaceId, setWorkspaceId] = useState<string>(ALL_WORKSPACES);
  const { isPending, run } = useSyncedTransition();

  const toggleScope = (scope: TokenScope, on: boolean) => {
    setScopes((prev) =>
      on ? [...prev.filter((s) => s !== scope), scope] : prev.filter((s) => s !== scope),
    );
  };

  const approve = async () => {
    if (scopes.length === 0) {
      toast.error("Grant at least one scope, or deny the request");
      return;
    }
    await run("oauth-approve", () =>
      approveAuthorization({
        clientId: client.clientId,
        redirectUri,
        scopes,
        workspaceId: workspaceId === ALL_WORKSPACES ? null : workspaceId,
        state,
        codeChallenge,
      }),
    );
  };

  const deny = async () => {
    await run("oauth-deny", () =>
      denyAuthorization({ clientId: client.clientId, redirectUri, state }),
    );
  };

  return (
    <div className="rounded-lg border p-6">
      <h1 className="font-heading text-lg font-semibold">
        Connect {client.name}
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        <span className="font-mono text-xs">{client.clientId}</span> wants to
        access your Stacks account ({userEmail}).
      </p>

      <div className="mt-5 flex flex-col gap-2">
        <Label>Allowed access</Label>
        {requestedScopes.map((scope) => (
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

      <div className="mt-5 flex flex-col gap-2">
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
          Restrict the connection to one workspace — calls outside it are
          rejected.
        </p>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={deny} disabled={isPending}>
          Deny
        </Button>
        <Button
          onClick={approve}
          loading={isPending}
          loadingText="Connecting…"
          disabled={scopes.length === 0}
        >
          Allow access
        </Button>
      </div>
    </div>
  );
}
