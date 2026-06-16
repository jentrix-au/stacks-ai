"use client";

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  createSyncStore,
  type SyncSnapshot,
  type SyncStore,
} from "./sync-store";

const SyncContext = createContext<SyncStore | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => createSyncStore(), []);
  return <SyncContext.Provider value={store}>{children}</SyncContext.Provider>;
}

export function useSyncStore(): SyncStore {
  const store = useContext(SyncContext);
  if (!store) {
    throw new Error("useSyncStore must be used inside <SyncProvider>");
  }
  return store;
}

export function useSyncStoreState(): SyncSnapshot {
  const store = useSyncStore();
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
