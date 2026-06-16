"use client";

import { useState } from "react";
import { CircleCheck, Undo2 } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pending, useSyncedTransition } from "@/components/sync";
import { BugSeverity } from "@/lib/enums";
import { updateBugReport } from "@/server/actions/bugs";

const SEVERITIES: { value: BugSeverity; label: string }[] = [
  { value: BugSeverity.TRIVIAL, label: "Trivial" },
  { value: BugSeverity.MINOR, label: "Minor" },
  { value: BugSeverity.MAJOR, label: "Major" },
  { value: BugSeverity.CRITICAL, label: "Critical" },
  { value: BugSeverity.BLOCKER, label: "Blocker" },
];

const UNSET = "__unset__";

export type BugReportValue = {
  severity: BugSeverity | null;
  reproSteps: string | null;
  expectedBehavior: string | null;
  actualBehavior: string | null;
  affectedVersion: string | null;
  environment: string | null;
  resolvedAt: Date | null;
};

export function BugReportEditor({
  taskId,
  value,
  onPatch,
}: {
  taskId: string;
  value: BugReportValue;
  onPatch: (next: Partial<BugReportValue>) => void;
}) {
  const { isPending, run } = useSyncedTransition();

  function commit(patch: Partial<BugReportValue>) {
    onPatch(patch);
    run("update-bug", () =>
      updateBugReport({
        taskId,
        ...(patch.severity !== undefined
          ? { severity: patch.severity ?? null }
          : {}),
        ...(patch.reproSteps !== undefined
          ? { reproSteps: patch.reproSteps ?? null }
          : {}),
        ...(patch.expectedBehavior !== undefined
          ? { expectedBehavior: patch.expectedBehavior ?? null }
          : {}),
        ...(patch.actualBehavior !== undefined
          ? { actualBehavior: patch.actualBehavior ?? null }
          : {}),
        ...(patch.affectedVersion !== undefined
          ? { affectedVersion: patch.affectedVersion ?? null }
          : {}),
        ...(patch.environment !== undefined
          ? { environment: patch.environment ?? null }
          : {}),
        ...(patch.resolvedAt !== undefined
          ? {
              resolvedAt: patch.resolvedAt
                ? patch.resolvedAt.toISOString()
                : null,
            }
          : {}),
      }),
    );
  }

  return (
    <Pending isPending={isPending} className="flex w-full flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto]">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
            Severity
          </span>
          <Select
            value={value.severity ?? UNSET}
            onValueChange={(v) =>
              commit({ severity: v === UNSET ? null : (v as BugSeverity) })
            }
          >
            <SelectTrigger size="sm" className="w-32">
              <SelectValue placeholder="Unset" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Unset</SelectItem>
              {SEVERITIES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <TextRow
          label="Affected version"
          value={value.affectedVersion ?? ""}
          placeholder="e.g. 1.4.2"
          onCommit={(v) =>
            commit({ affectedVersion: v.trim() === "" ? null : v.trim() })
          }
        />
        <ResolutionToggle
          resolvedAt={value.resolvedAt}
          onToggle={() =>
            commit({ resolvedAt: value.resolvedAt ? null : new Date() })
          }
        />
      </div>
      <TextRow
        label="Environment"
        value={value.environment ?? ""}
        placeholder="e.g. macOS 14 / Chrome 122"
        onCommit={(v) =>
          commit({ environment: v.trim() === "" ? null : v.trim() })
        }
      />
      <TextareaRow
        label="Steps to reproduce"
        value={value.reproSteps ?? ""}
        onCommit={(v) => commit({ reproSteps: v.trim() === "" ? null : v })}
      />
      <TextareaRow
        label="Expected behavior"
        value={value.expectedBehavior ?? ""}
        onCommit={(v) =>
          commit({ expectedBehavior: v.trim() === "" ? null : v })
        }
      />
      <TextareaRow
        label="Actual behavior"
        value={value.actualBehavior ?? ""}
        onCommit={(v) => commit({ actualBehavior: v.trim() === "" ? null : v })}
      />
    </Pending>
  );
}

function TextRow({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (next: string) => void;
}) {
  const [local, setLocal] = useState(value);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        {label}
      </span>
      <Input
        value={local}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== value) onCommit(local);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-8"
      />
    </div>
  );
}

function TextareaRow({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
}) {
  const [local, setLocal] = useState(value);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        {label}
      </span>
      <Textarea
        value={local}
        rows={3}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== value) onCommit(local);
        }}
        className="resize-y"
      />
    </div>
  );
}

function ResolutionToggle({
  resolvedAt,
  onToggle,
}: {
  resolvedAt: Date | null;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        Status
      </span>
      <Button
        type="button"
        size="sm"
        variant={resolvedAt ? "outline" : "default"}
        onClick={onToggle}
        className="gap-1.5"
      >
        {resolvedAt ? (
          <>
            <Undo2 className="size-3" />
            Reopen
            <span className="text-muted-foreground text-[10px]">
              · resolved {format(resolvedAt, "MMM d")}
            </span>
          </>
        ) : (
          <>
            <CircleCheck className="size-3" />
            Mark resolved
          </>
        )}
      </Button>
    </div>
  );
}
