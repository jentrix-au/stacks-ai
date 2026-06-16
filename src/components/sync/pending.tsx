"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SpinnerMode = "inline" | "overlay" | "none";

export interface PendingProps {
  isPending: boolean;
  children: ReactNode;
  spinner?: SpinnerMode;
  className?: string;
  label?: string;
  as?: "div" | "span";
}

export function Pending({
  isPending,
  children,
  spinner = "none",
  className,
  label,
  as = "div",
}: PendingProps) {
  const Tag = as;
  const baseLayout =
    spinner === "inline"
      ? "inline-flex items-center"
      : spinner === "overlay"
        ? "relative"
        : "";
  return (
    <Tag
      data-pending={isPending ? "true" : undefined}
      aria-busy={isPending || undefined}
      aria-live="polite"
      className={cn(
        "transition-opacity duration-150 ease-out",
        baseLayout,
        isPending && "pointer-events-none opacity-60",
        className,
      )}
    >
      {children}
      {isPending && spinner === "inline" ? (
        <span className="text-muted-foreground ml-1.5 inline-flex shrink-0 items-center">
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          <span className="sr-only">{label ?? "Saving"}</span>
        </span>
      ) : null}
      {isPending && spinner === "overlay" ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2
            className="text-muted-foreground size-4 animate-spin"
            aria-hidden="true"
          />
          <span className="sr-only">{label ?? "Saving"}</span>
        </span>
      ) : null}
    </Tag>
  );
}
