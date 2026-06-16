"use client";

import { Calendar as CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pending, useSyncedTransition } from "@/components/sync";
import { TicketSeverity } from "@/lib/enums";
import { updateTicket } from "@/server/actions/tickets";

const SEVERITIES: { value: TicketSeverity; label: string }[] = [
  { value: TicketSeverity.LOW, label: "Low" },
  { value: TicketSeverity.NORMAL, label: "Normal" },
  { value: TicketSeverity.HIGH, label: "High" },
  { value: TicketSeverity.URGENT, label: "Urgent" },
];

const SOURCES = ["email", "chat", "phone", "other"] as const;
const UNSET = "__unset__";

export type TicketValue = {
  severity: TicketSeverity | null;
  slaDueAt: Date | null;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  source: string | null;
};

export function TicketEditor({
  taskId,
  value,
  onPatch,
}: {
  taskId: string;
  value: TicketValue;
  onPatch: (next: Partial<TicketValue>) => void;
}) {
  const { isPending, run } = useSyncedTransition();

  function commit(patch: Partial<TicketValue>) {
    onPatch(patch);
    run("update-ticket", () =>
      updateTicket({
        taskId,
        ...(patch.severity !== undefined
          ? { severity: patch.severity ?? null }
          : {}),
        ...(patch.slaDueAt !== undefined
          ? {
              slaDueAt: patch.slaDueAt ? patch.slaDueAt.toISOString() : null,
            }
          : {}),
        ...(patch.firstResponseAt !== undefined
          ? {
              firstResponseAt: patch.firstResponseAt
                ? patch.firstResponseAt.toISOString()
                : null,
            }
          : {}),
        ...(patch.resolvedAt !== undefined
          ? {
              resolvedAt: patch.resolvedAt
                ? patch.resolvedAt.toISOString()
                : null,
            }
          : {}),
        ...(patch.source !== undefined ? { source: patch.source ?? null } : {}),
      }),
    );
  }

  return (
    <Pending isPending={isPending} className="grid gap-3 sm:grid-cols-2">
      <Field label="Severity">
        <Select
          value={value.severity ?? UNSET}
          onValueChange={(v) =>
            commit({
              severity: v === UNSET ? null : (v as TicketSeverity),
            })
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
      </Field>
      <Field label="Source">
        <Select
          value={value.source ?? UNSET}
          onValueChange={(v) => commit({ source: v === UNSET ? null : v })}
        >
          <SelectTrigger size="sm" className="w-32">
            <SelectValue placeholder="Unset" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET}>Unset</SelectItem>
            {SOURCES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="SLA due">
        <DateControl
          value={value.slaDueAt}
          onChange={(d) => commit({ slaDueAt: d })}
          ariaLabel="Clear SLA"
        />
      </Field>
      <Field label="First response">
        <DateControl
          value={value.firstResponseAt}
          onChange={(d) => commit({ firstResponseAt: d })}
          ariaLabel="Clear first response"
        />
      </Field>
      <Field label="Resolved">
        <DateControl
          value={value.resolvedAt}
          onChange={(d) => commit({ resolvedAt: d })}
          ariaLabel="Clear resolution"
        />
      </Field>
    </Pending>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function DateControl({
  value,
  onChange,
  ariaLabel,
}: {
  value: Date | null;
  onChange: (d: Date | null) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm" className="gap-1.5">
              <CalendarIcon className="size-3" />
              <span className="text-xs">
                {value ? format(value, "MMM d, yyyy") : "Set date"}
              </span>
            </Button>
          }
        />
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={value ?? undefined}
            onSelect={(date) => onChange(date ?? null)}
          />
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={ariaLabel}
          onClick={() => onChange(null)}
        >
          <X className="size-3" />
        </Button>
      )}
    </div>
  );
}
