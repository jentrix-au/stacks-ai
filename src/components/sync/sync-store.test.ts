import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSyncStore } from "./sync-store";
import { ANIM } from "./tokens";

describe("createSyncStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in idle state", () => {
    const store = createSyncStore();
    expect(store.getSnapshot()).toEqual({ state: "idle", lastError: null });
  });

  it("does not flash saving when an op completes within the debounce window", () => {
    const store = createSyncStore();
    store.start("a");
    expect(store.getSnapshot().state).toBe("idle");
    vi.advanceTimersByTime(ANIM.startDebounceMs - 10);
    store.succeed("a");
    expect(store.getSnapshot().state).toBe("idle");
    // No saved state because saving was never shown
    vi.advanceTimersByTime(ANIM.savedDecayMs + 100);
    expect(store.getSnapshot().state).toBe("idle");
  });

  it("transitions saving → saved → idle when an op exceeds debounce", () => {
    const store = createSyncStore();
    store.start("a");
    vi.advanceTimersByTime(ANIM.startDebounceMs + 10);
    expect(store.getSnapshot().state).toBe("saving");
    store.succeed("a");
    expect(store.getSnapshot().state).toBe("saved");
    vi.advanceTimersByTime(ANIM.savedDecayMs + 10);
    expect(store.getSnapshot().state).toBe("idle");
  });

  it("emits saved only once after multiple parallel ops resolve", () => {
    const store = createSyncStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.start("a");
    store.start("b");
    vi.advanceTimersByTime(ANIM.startDebounceMs + 10);
    expect(store.getSnapshot().state).toBe("saving");
    store.succeed("a");
    expect(store.getSnapshot().state).toBe("saving");
    store.succeed("b");
    expect(store.getSnapshot().state).toBe("saved");
    vi.advanceTimersByTime(ANIM.savedDecayMs + 10);
    expect(store.getSnapshot().state).toBe("idle");
  });

  it("transitions to error and decays back to idle", () => {
    const store = createSyncStore();
    store.start("a");
    vi.advanceTimersByTime(ANIM.startDebounceMs + 10);
    store.fail("a", "boom");
    expect(store.getSnapshot()).toEqual({ state: "error", lastError: "boom" });
    vi.advanceTimersByTime(ANIM.errorDecayMs + 10);
    expect(store.getSnapshot().state).toBe("idle");
  });

  it("does not produce a saved state when fail happens during debounce", () => {
    const store = createSyncStore();
    store.start("a");
    store.fail("a", "boom");
    expect(store.getSnapshot()).toEqual({ state: "error", lastError: "boom" });
  });

  it("notifies subscribers on transitions and skips no-op writes", () => {
    const store = createSyncStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.start("a");
    vi.advanceTimersByTime(ANIM.startDebounceMs + 10);
    expect(listener).toHaveBeenCalledTimes(1);
    store.succeed("a");
    expect(listener).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(ANIM.savedDecayMs + 10);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("allows unsubscribe", () => {
    const store = createSyncStore();
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    unsub();
    store.start("a");
    vi.advanceTimersByTime(ANIM.startDebounceMs + 10);
    expect(listener).not.toHaveBeenCalled();
  });

  it("reset clears all state and timers", () => {
    const store = createSyncStore();
    store.start("a");
    vi.advanceTimersByTime(ANIM.startDebounceMs + 10);
    store.reset();
    expect(store.getSnapshot()).toEqual({ state: "idle", lastError: null });
    vi.advanceTimersByTime(ANIM.savedDecayMs + ANIM.errorDecayMs);
    expect(store.getSnapshot().state).toBe("idle");
  });
});
