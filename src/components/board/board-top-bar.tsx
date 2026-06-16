"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, RefreshCw, Tag, Zap } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Pending, SavedPulse, useSyncedTransition } from "@/components/sync";
import { renameBoard, archiveBoard } from "@/server/actions/boards";
import { BoardFilters } from "./board-filters";
import { SavedViews } from "./saved-views";
import { AutomationsDialog } from "./automations-dialog";
import type { SavedViewSummary } from "@/server/views/operations";
import { BoardKindBadge } from "./board-kind-badge";
import { ConvertBoardKindDialog } from "./convert-board-kind-dialog";
import { LabelsManagerDialog, type Label } from "./labels-manager-dialog";
import type { FullBoard } from "@/server/queries/boards";
import type { WorkspaceMember } from "./board-client";

export function BoardTopBar({
  board,
  members,
  savedViews = [],
  currentUserId,
  onRenamed,
  onLabelCreated,
  onLabelUpdated,
  onLabelDeleted,
}: {
  board: NonNullable<FullBoard>;
  members: WorkspaceMember[];
  savedViews?: SavedViewSummary[];
  currentUserId?: string;
  onRenamed: (name: string) => void;
  onLabelCreated: (label: Label) => void;
  onLabelUpdated: (label: Label) => void;
  onLabelDeleted: (labelId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(board.name);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [automationsOpen, setAutomationsOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const renameTx = useSyncedTransition();
  const archiveTx = useSyncedTransition();

  async function commit() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== board.name) {
      const fd = new FormData();
      fd.set("boardId", board.id);
      fd.set("name", trimmed);
      const result = await renameTx.run("rename-board", () => renameBoard(fd));
      if (result) {
        onRenamed(result.name);
        setPulseKey((k) => k + 1);
      } else {
        setName(board.name);
      }
    } else {
      setName(board.name);
    }
    setEditing(false);
  }

  return (
    <div className="border-border/60 flex h-12 items-center gap-2 border-b px-3">
      {editing ? (
        <Pending isPending={renameTx.isPending} spinner="inline">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setName(board.name);
                setEditing(false);
              }
            }}
            className="h-7 max-w-[300px] text-sm font-medium"
          />
        </Pending>
      ) : (
        <SavedPulse pulseKey={pulseKey}>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="group hover:bg-muted/60 flex items-center gap-1.5 rounded-md px-1.5 py-0.5"
          >
            <span className="text-sm font-semibold tracking-tight">
              {board.name}
            </span>
            <Pencil className="text-muted-foreground size-3 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        </SavedPulse>
      )}

      <BoardKindBadge kind={board.kind} size="xs" />

      <span className="text-muted-foreground hidden text-xs sm:inline">
        in <span className="font-medium">{board.workspace.name}</span>
      </span>

      <Separator orientation="vertical" className="!h-4" />
      <BoardFilters labels={board.labels} members={members} />

      <Separator orientation="vertical" className="!h-4" />
      <SavedViews
        boardId={board.id}
        initialViews={savedViews}
        currentUserId={currentUserId ?? ""}
      />

      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Board options"
              />
            }
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setLabelsOpen(true)}>
              <Tag className="size-3.5" />
              Manage labels
              {board.labels.length > 0 && ` (${board.labels.length})`}…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAutomationsOpen(true)}>
              <Zap className="size-3.5" />
              Automations…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setConvertOpen(true)}>
              <RefreshCw className="size-3.5" />
              Change board kind…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                const fd = new FormData();
                fd.set("boardId", board.id);
                archiveTx.run("archive-board", () => archiveBoard(fd));
              }}
            >
              Archive board
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <LabelsManagerDialog
        open={labelsOpen}
        onOpenChange={setLabelsOpen}
        boardId={board.id}
        labels={board.labels}
        onLabelCreated={onLabelCreated}
        onLabelUpdated={onLabelUpdated}
        onLabelDeleted={onLabelDeleted}
      />
      <ConvertBoardKindDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        boardId={board.id}
        currentKind={board.kind}
      />
      <AutomationsDialog
        open={automationsOpen}
        onOpenChange={setAutomationsOpen}
        boardId={board.id}
        workspaceId={board.workspace.id}
        columns={board.columns.map((c) => ({ id: c.id, name: c.name }))}
        labels={board.labels.map((l) => ({ id: l.id, name: l.name }))}
        members={members}
      />
    </div>
  );
}
