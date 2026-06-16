"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSyncedTransition } from "@/components/sync";
import { renameWorkspace } from "@/server/actions/workspaces";

export function WorkspaceSettingsForm({
  workspace,
  canEdit,
}: {
  workspace: { id: string; name: string; slug: string };
  canEdit: boolean;
}) {
  const [name, setName] = useState(workspace.name);
  const { isPending, run } = useSyncedTransition();

  async function save() {
    if (!name.trim() || name === workspace.name) return;
    const fd = new FormData();
    fd.set("workspaceId", workspace.id);
    fd.set("name", name.trim());
    const ok = await run("rename-workspace", () => renameWorkspace(fd));
    if (ok !== null) toast.success("Workspace renamed");
  }

  return (
    <div className="space-y-6">
      <div className="border-border bg-card rounded-xl border p-5">
        <Label
          htmlFor="ws-name"
          className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
        >
          Workspace name
        </Label>
        <div className="mt-2 flex gap-2">
          <Input
            id="ws-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEdit || isPending}
            maxLength={80}
          />
          <Button
            onClick={save}
            disabled={!canEdit || name === workspace.name}
            loading={isPending}
            loadingText="Saving"
          >
            Save
          </Button>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          URL: /<span className="font-mono">{workspace.slug}</span>
        </p>
      </div>
    </div>
  );
}
