"use client";

import { useSyncExternalStore } from "react";
import { format, isPast, isToday, isTomorrow } from "date-fns";

type Variant = "due" | "sla";

interface RelativeDateState {
  label: string;
  overdue: boolean;
}

function computeAbsolute(date: Date, variant: Variant): RelativeDateState {
  return {
    label:
      variant === "sla"
        ? `SLA ${format(date, "MMM d")}`
        : format(date, "MMM d"),
    overdue: false,
  };
}

function computeRelative(
  date: Date,
  variant: Variant,
  resolved: boolean,
): RelativeDateState {
  const t = isToday(date);
  const tm = isTomorrow(date);
  const label =
    variant === "sla"
      ? t
        ? "SLA today"
        : tm
          ? "SLA tomorrow"
          : `SLA ${format(date, "MMM d")}`
      : t
        ? "Today"
        : tm
          ? "Tomorrow"
          : format(date, "MMM d");
  return { label, overdue: !resolved && isPast(date) && !t };
}

const subscribeNoop = () => () => {};
const getHydratedSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Renders a date as a stable absolute string during SSR and the first
 * client render (so hydration agrees across timezones), then upgrades
 * to relative "Today"/"Tomorrow" plus overdue state after hydration
 * completes. Uses `useSyncExternalStore` so React knows to swap snapshots
 * post-hydration without any setState-in-effect cascade.
 */
export function useRelativeDate(
  date: Date,
  variant: Variant = "due",
  resolved = false,
): RelativeDateState {
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    getHydratedSnapshot,
    getServerSnapshot,
  );
  return hydrated
    ? computeRelative(date, variant, resolved)
    : computeAbsolute(date, variant);
}
