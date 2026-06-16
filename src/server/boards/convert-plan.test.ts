import { describe, expect, it } from "vitest";

import { BoardKind } from "@/lib/enums";
import { sidecarTaskIdsFor, type TaskSidecarFlags } from "./convert-plan";

const KINDS = Object.values(BoardKind);

/** A task as it exists on a board of `kind` (carrying that kind's sidecar). */
function taskOf(kind: BoardKind, id: string): TaskSidecarFlags {
  return {
    id,
    hasDeal: kind === BoardKind.CRM,
    hasBugReport: kind === BoardKind.BUGS,
    hasTicket: kind === BoardKind.SUPPORT,
    hasInitiative: kind === BoardKind.ROADMAP,
  };
}

const SIDECAR_FLAG: Record<BoardKind, keyof TaskSidecarFlags | null> = {
  TASKS: null,
  CRM: "hasDeal",
  BUGS: "hasBugReport",
  SUPPORT: "hasTicket",
  ROADMAP: "hasInitiative",
};

describe("sidecarTaskIdsFor — every kind pair", () => {
  for (const from of KINDS) {
    for (const to of KINDS) {
      it(`${from} → ${to}`, () => {
        const tasks = [taskOf(from, "t1"), taskOf(from, "t2")];
        const ids = sidecarTaskIdsFor(to, tasks);
        if (to === BoardKind.TASKS || to === from) {
          // TASKS has no sidecar; same-kind tasks already carry theirs.
          expect(ids).toEqual([]);
        } else {
          // Every task needs the target sidecar backfilled.
          expect(ids).toEqual(["t1", "t2"]);
        }
      });
    }
  }

  it("skips tasks that already carry the target sidecar (round-trip)", () => {
    // A task created on a CRM board, after CRM → TASKS → CRM, still has its
    // Deal — converting back must not plan a duplicate.
    const roundTripped = taskOf(BoardKind.CRM, "kept");
    const fresh = taskOf(BoardKind.TASKS, "fresh");
    expect(sidecarTaskIdsFor(BoardKind.CRM, [roundTripped, fresh])).toEqual([
      "fresh",
    ]);
  });

  it("handles tasks carrying several sidecars from past conversions", () => {
    const veteran: TaskSidecarFlags = {
      id: "v",
      hasDeal: true,
      hasBugReport: true,
      hasTicket: false,
      hasInitiative: false,
    };
    for (const to of KINDS) {
      const expected = SIDECAR_FLAG[to] && !veteran[SIDECAR_FLAG[to]];
      expect(sidecarTaskIdsFor(to, [veteran])).toEqual(expected ? ["v"] : []);
    }
  });
});
