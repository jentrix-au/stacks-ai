"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, OctagonAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { useSyncStoreState } from "./sync-context";
import { ANIM } from "./tokens";

const transition = {
  duration: 0.18,
  ease: ANIM.easeOut,
};

export function SyncBadge({ className }: { className?: string }) {
  const { state, lastError } = useSyncStoreState();
  if (state === "idle") {
    return (
      <span
        aria-hidden="true"
        className={cn("inline-block h-6 w-px", className)}
      />
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "text-muted-foreground pointer-events-none flex h-6 items-center gap-1.5 text-xs",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {state === "saving" && (
          <motion.span
            key="saving"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={transition}
            className="flex items-center gap-1.5"
          >
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            <span>Saving…</span>
          </motion.span>
        )}
        {state === "saved" && (
          <motion.span
            key="saved"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={transition}
            className="text-foreground/80 flex items-center gap-1.5"
          >
            <Check className="size-3.5" aria-hidden="true" />
            <span>All changes saved</span>
          </motion.span>
        )}
        {state === "error" && (
          <motion.span
            key="error"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={transition}
            className="text-destructive flex items-center gap-1.5"
            title={lastError ?? undefined}
          >
            <OctagonAlert className="size-3.5" aria-hidden="true" />
            <span className="max-w-[180px] truncate">
              {lastError ?? "Failed to save"}
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
