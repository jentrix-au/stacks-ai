"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pending, useSyncedTransition } from "@/components/sync";
import { InitiativeConfidence } from "@/lib/enums";
import { updateInitiative } from "@/server/actions/initiatives";

const CONFIDENCES: { value: InitiativeConfidence; label: string }[] = [
  { value: InitiativeConfidence.LOW, label: "Low" },
  { value: InitiativeConfidence.MEDIUM, label: "Medium" },
  { value: InitiativeConfidence.HIGH, label: "High" },
];

const UNSET = "__unset__";

export type InitiativeValue = {
  targetQuarter: string | null;
  confidence: InitiativeConfidence | null;
  effortEstimate: string | null;
};

export function InitiativeEditor({
  taskId,
  value,
  onPatch,
}: {
  taskId: string;
  value: InitiativeValue;
  onPatch: (next: Partial<InitiativeValue>) => void;
}) {
  const { isPending, run } = useSyncedTransition();

  function commit(patch: Partial<InitiativeValue>) {
    onPatch(patch);
    run("update-initiative", () =>
      updateInitiative({
        taskId,
        ...(patch.targetQuarter !== undefined
          ? { targetQuarter: patch.targetQuarter ?? null }
          : {}),
        ...(patch.confidence !== undefined
          ? { confidence: patch.confidence ?? null }
          : {}),
        ...(patch.effortEstimate !== undefined
          ? { effortEstimate: patch.effortEstimate ?? null }
          : {}),
      }),
    );
  }

  return (
    <Pending isPending={isPending} className="grid gap-3 sm:grid-cols-3">
      <TextField
        label="Target quarter"
        value={value.targetQuarter ?? ""}
        placeholder="2026-Q2"
        onCommit={(v) =>
          commit({ targetQuarter: v.trim() === "" ? null : v.trim() })
        }
      />
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
          Confidence
        </span>
        <Select
          value={value.confidence ?? UNSET}
          onValueChange={(v) =>
            commit({
              confidence: v === UNSET ? null : (v as InitiativeConfidence),
            })
          }
        >
          <SelectTrigger size="sm" className="w-32">
            <SelectValue placeholder="Unset" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET}>Unset</SelectItem>
            {CONFIDENCES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <TextField
        label="Effort"
        value={value.effortEstimate ?? ""}
        placeholder="S / M / L / XL"
        onCommit={(v) =>
          commit({ effortEstimate: v.trim() === "" ? null : v.trim() })
        }
      />
    </Pending>
  );
}

function TextField({
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
