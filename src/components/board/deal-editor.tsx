"use client";

import { useState } from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pending, useSyncedTransition } from "@/components/sync";
import { COMMON_CURRENCIES, formatMoney } from "@/lib/money";
import { updateDeal } from "@/server/actions/deals";

type DealValue = {
  amount: number | null;
  currency: string | null;
  expectedCloseAt: Date | null;
};

export function DealEditor({
  taskId,
  value,
  onPatch,
}: {
  taskId: string;
  value: DealValue;
  onPatch: (next: Partial<DealValue>) => void;
}) {
  const { isPending, run } = useSyncedTransition();

  function commit(patch: Partial<DealValue>) {
    onPatch(patch);
    run("update-deal", () =>
      updateDeal({
        taskId,
        ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
        ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
        ...(patch.expectedCloseAt !== undefined
          ? {
              expectedCloseAt: patch.expectedCloseAt
                ? patch.expectedCloseAt.toISOString()
                : null,
            }
          : {}),
      }),
    );
  }

  return (
    <Pending isPending={isPending} className="block w-full">
      <div className="flex w-full flex-col gap-3">
        <AmountRow value={value} onCommit={commit} />
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
            Expected close
          </span>
          <ExpectedCloseControl
            value={value.expectedCloseAt}
            onChange={(d) => commit({ expectedCloseAt: d })}
          />
        </div>
      </div>
    </Pending>
  );
}

function AmountRow({
  value,
  onCommit,
}: {
  value: DealValue;
  onCommit: (patch: Partial<DealValue>) => void;
}) {
  const [amountStr, setAmountStr] = useState(
    value.amount == null ? "" : String(value.amount),
  );
  const currency = value.currency ?? "USD";

  function handleAmountBlur() {
    const trimmed = amountStr.trim();
    if (trimmed === "") {
      if (value.amount != null) onCommit({ amount: null });
      return;
    }
    const n = Number(trimmed);
    if (Number.isNaN(n) || n < 0) {
      toast.error("Amount must be a non-negative number");
      setAmountStr(value.amount == null ? "" : String(value.amount));
      return;
    }
    if (n !== value.amount) onCommit({ amount: n });
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        Amount
      </span>
      <div className="flex items-center gap-2">
        <Input
          inputMode="decimal"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          onBlur={handleAmountBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="0.00"
          className="h-8 max-w-[160px]"
        />
        <Select
          value={currency}
          onValueChange={(c) => onCommit({ currency: c })}
        >
          <SelectTrigger size="sm" className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMMON_CURRENCIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {value.amount != null && (
          <span className="text-muted-foreground text-xs">
            {formatMoney(value.amount, value.currency)}
          </span>
        )}
      </div>
    </div>
  );
}

function ExpectedCloseControl({
  value,
  onChange,
}: {
  value: Date | null;
  onChange: (d: Date | null) => void;
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
          aria-label="Clear expected close date"
          onClick={() => onChange(null)}
        >
          <X className="size-3" />
        </Button>
      )}
    </div>
  );
}
