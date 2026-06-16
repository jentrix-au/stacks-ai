import { ANIM } from "./tokens";

export type SyncState = "idle" | "saving" | "saved" | "error";

export type SyncSnapshot = {
  state: SyncState;
  lastError: string | null;
};

export type SyncStore = {
  start: (id: string) => void;
  succeed: (id: string) => void;
  fail: (id: string, message: string) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => SyncSnapshot;
  reset: () => void;
};

type Timer = ReturnType<typeof setTimeout>;

export function createSyncStore(): SyncStore {
  const listeners = new Set<() => void>();
  const activeIds = new Set<string>();
  let snapshot: SyncSnapshot = { state: "idle", lastError: null };
  let savingTimer: Timer | null = null;
  let savedTimer: Timer | null = null;
  let errorTimer: Timer | null = null;
  let showedSaving = false;

  function emit() {
    listeners.forEach((l) => l());
  }

  function setSnap(next: SyncSnapshot) {
    if (
      next.state === snapshot.state &&
      next.lastError === snapshot.lastError
    ) {
      return;
    }
    snapshot = next;
    emit();
  }

  function clearTimers() {
    if (savingTimer) {
      clearTimeout(savingTimer);
      savingTimer = null;
    }
    if (savedTimer) {
      clearTimeout(savedTimer);
      savedTimer = null;
    }
    if (errorTimer) {
      clearTimeout(errorTimer);
      errorTimer = null;
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot() {
      return snapshot;
    },

    start(id) {
      activeIds.add(id);
      if (savedTimer) {
        clearTimeout(savedTimer);
        savedTimer = null;
      }
      if (errorTimer) {
        clearTimeout(errorTimer);
        errorTimer = null;
      }
      if (savingTimer) return;
      savingTimer = setTimeout(() => {
        savingTimer = null;
        if (activeIds.size > 0) {
          showedSaving = true;
          setSnap({ state: "saving", lastError: null });
        }
      }, ANIM.startDebounceMs);
    },

    succeed(id) {
      activeIds.delete(id);
      if (activeIds.size > 0) return;

      if (savingTimer) {
        clearTimeout(savingTimer);
        savingTimer = null;
      }

      if (showedSaving) {
        showedSaving = false;
        setSnap({ state: "saved", lastError: null });
        if (savedTimer) clearTimeout(savedTimer);
        savedTimer = setTimeout(() => {
          savedTimer = null;
          setSnap({ state: "idle", lastError: null });
        }, ANIM.savedDecayMs);
      } else {
        setSnap({ state: "idle", lastError: null });
      }
    },

    fail(id, message) {
      activeIds.delete(id);
      if (savingTimer) {
        clearTimeout(savingTimer);
        savingTimer = null;
      }
      if (savedTimer) {
        clearTimeout(savedTimer);
        savedTimer = null;
      }
      showedSaving = false;
      setSnap({ state: "error", lastError: message });
      if (errorTimer) clearTimeout(errorTimer);
      errorTimer = setTimeout(() => {
        errorTimer = null;
        setSnap({ state: "idle", lastError: null });
      }, ANIM.errorDecayMs);
    },

    reset() {
      clearTimers();
      activeIds.clear();
      showedSaving = false;
      setSnap({ state: "idle", lastError: null });
    },
  };
}
