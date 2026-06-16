"use client";

import { Priority } from "@/lib/enums";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Pending } from "@/components/sync";
import { PriorityDot } from "./priority-dot";

const LABELS: Record<Priority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export function PrioritySwitcher({
  value,
  onChange,
  pending = false,
}: {
  value: Priority;
  onChange: (p: Priority) => void;
  pending?: boolean;
}) {
  return (
    <Pending isPending={pending} className="block">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              loading={pending}
              className="gap-1.5"
            >
              <PriorityDot priority={value} />
              <span className="text-xs">{LABELS[value]}</span>
              <ChevronDown className="text-muted-foreground size-3" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-40">
          {(Object.values(Priority) as Priority[]).map((p) => (
            <DropdownMenuItem
              key={p}
              onClick={() => onChange(p)}
              className="cursor-pointer"
            >
              <PriorityDot priority={p} />
              {LABELS[p]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </Pending>
  );
}
