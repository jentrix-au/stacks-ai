"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";
import { ANIM } from "./tokens";

export interface SavedPulseProps {
  pulseKey: string | number;
  children: ReactNode;
  className?: string;
  variant?: "ring" | "background";
}

export function SavedPulse({
  pulseKey,
  children,
  className,
  variant = "ring",
}: SavedPulseProps) {
  const [active, setActive] = useState(false);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setActive(true);
    const t = setTimeout(() => setActive(false), ANIM.pulseMs);
    return () => clearTimeout(t);
  }, [pulseKey]);

  return (
    <span
      className={cn(
        "relative inline-block rounded-md",
        active && variant === "ring" && "animate-saved-pulse-ring",
        active && variant === "background" && "animate-saved-pulse-bg",
        className,
      )}
    >
      {children}
    </span>
  );
}

export interface SavedPulseHandle {
  trigger: () => void;
}

export const SavedPulseImperative = forwardRef<
  SavedPulseHandle,
  { children: ReactNode; className?: string; variant?: "ring" | "background" }
>(function SavedPulseImperative(
  { children, className, variant = "ring" },
  ref,
) {
  const [active, setActive] = useState(false);

  const trigger = useCallback(() => {
    setActive(false);
    requestAnimationFrame(() => setActive(true));
  }, []);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(false), ANIM.pulseMs);
    return () => clearTimeout(t);
  }, [active]);

  useImperativeHandle(ref, () => ({ trigger }), [trigger]);

  return (
    <span
      className={cn(
        "relative inline-block rounded-md",
        active && variant === "ring" && "animate-saved-pulse-ring",
        active && variant === "background" && "animate-saved-pulse-bg",
        className,
      )}
    >
      {children}
    </span>
  );
});

export function useSavedPulse() {
  const ref = useRef<SavedPulseHandle>(null);
  const trigger = useCallback(() => ref.current?.trigger(), []);
  return { ref, trigger };
}
