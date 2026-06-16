"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { toast } from "sonner";

import { useSyncStore } from "./sync-context";

export type RunOptions = {
  silent?: boolean;
  onSaved?: () => void;
  onError?: (message: string) => void;
  suppressToast?: boolean;
};

export type SyncedTransition = {
  isPending: boolean;
  error: string | null;
  /**
   * Runs the async function inside a React transition while reporting
   * start/succeed/fail to the global sync store. The returned promise
   * resolves to the function's value on success and `null` on failure.
   * `null` (not `undefined`) is the failure sentinel so that void server
   * actions — which legitimately resolve to `undefined` on success —
   * can still be distinguished from failure.
   */
  run: <T>(
    label: string,
    fn: () => Promise<T>,
    options?: RunOptions,
  ) => Promise<T | null>;
  clearError: () => void;
};

export function useSyncedTransition(): SyncedTransition {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const store = useSyncStore();
  const counter = useRef(0);

  const run = useCallback(
    <T>(
      label: string,
      fn: () => Promise<T>,
      options?: RunOptions,
    ): Promise<T | null> => {
      const id = `${label}-${++counter.current}`;
      return new Promise<T | null>((resolve) => {
        startTransition(async () => {
          const silent = options?.silent ?? false;
          if (!silent) store.start(id);
          try {
            const result = await fn();
            setError(null);
            if (!silent) store.succeed(id);
            options?.onSaved?.();
            resolve(result);
          } catch (err) {
            try {
              // redirect()/notFound() thrown by an action (e.g. sign-out's
              // redirectTo) are Next control flow, not failure — toasting
              // them shows "NEXT_REDIRECT" and swallows the navigation.
              unstable_rethrow(err);
            } catch (controlFlow) {
              setError(null);
              if (!silent) store.succeed(id);
              // null tells callers to skip their local success handling —
              // the navigation Next is about to perform owns what's next.
              resolve(null);
              throw controlFlow;
            }
            const message =
              err instanceof Error && err.message
                ? err.message
                : "Something went wrong";
            setError(message);
            if (!silent) store.fail(id, message);
            if (!options?.suppressToast) toast.error(message);
            options?.onError?.(message);
            resolve(null);
          }
        });
      });
    },
    [store],
  );

  const clearError = useCallback(() => setError(null), []);

  return { isPending, error, run, clearError };
}
