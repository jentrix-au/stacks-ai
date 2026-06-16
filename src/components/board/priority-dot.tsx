import { Priority } from "@/lib/enums";
import { cn } from "@/lib/utils";

const COLORS: Record<Priority, string> = {
  LOW: "bg-slate-400/70",
  MEDIUM: "bg-sky-500/80",
  HIGH: "bg-amber-500/90",
  URGENT: "bg-rose-500",
};

const LABELS: Record<Priority, string> = {
  LOW: "Low priority",
  MEDIUM: "Medium priority",
  HIGH: "High priority",
  URGENT: "Urgent",
};

export function PriorityDot({
  priority,
  size = "sm",
}: {
  priority: Priority;
  size?: "sm" | "md";
}) {
  return (
    <span
      title={LABELS[priority]}
      aria-label={LABELS[priority]}
      className={cn(
        "inline-block rounded-full",
        size === "sm" ? "size-1.5" : "size-2",
        COLORS[priority],
      )}
    />
  );
}
