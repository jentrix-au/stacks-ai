"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
import { Button } from "@/components/ui/button";
import { useSyncedTransition } from "@/components/sync";
import { BoardKind } from "@/lib/enums";
import { convertBoardKind } from "@/server/actions/boards";

const KIND_LABEL: Record<BoardKind, string> = {
  TASKS: "Tasks",
  CRM: "CRM",
  SUPPORT: "Support",
  BUGS: "Bugs",
  ROADMAP: "Roadmap",
};

const SIDECAR_COPY: Record<BoardKind, string | null> = {
  TASKS: null,
  CRM: "adds a Deal sidecar to every task",
  SUPPORT: "adds a Ticket sidecar to every task",
  BUGS: "adds a Bug report sidecar to every task",
  ROADMAP: "adds an Initiative sidecar to every task",
};

export function ConvertBoardKindDialog({
  open,
  onOpenChange,
  boardId,
  currentKind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  currentKind: BoardKind;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<BoardKind>(currentKind);
  const { isPending, run } = useSyncedTransition();

  async function confirm() {
    const result = await run("convert-board-kind", () =>
      convertBoardKind({ boardId, kind }),
    );
    if (result !== null) {
      onOpenChange(false);
      router.refresh();
    }
  }

  const sidecarCopy = SIDECAR_COPY[kind];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change board kind</DialogTitle>
          <DialogDescription>
            Columns, tasks, and existing sidecar data are preserved.
            {sidecarCopy && kind !== currentKind && (
              <> Converting {sidecarCopy} on this board.</>
            )}
          </DialogDescription>
        </DialogHeader>
        <Select value={kind} onValueChange={(v) => setKind(v as BoardKind)}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {(value: string | null) =>
                value ? KIND_LABEL[value as BoardKind] : null
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(KIND_LABEL) as BoardKind[]).map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_LABEL[k]}
                {k === currentKind ? " (current)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={kind === currentKind}
            loading={isPending}
            loadingText="Converting…"
            onClick={confirm}
          >
            Convert to {KIND_LABEL[kind]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
