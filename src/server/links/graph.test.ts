import { describe, expect, it } from "vitest";

import { findCyclePath, wouldCreateCycle, type LinkEdge } from "./graph";

describe("wouldCreateCycle", () => {
  it("rejects a self-edge for directional kinds", () => {
    expect(
      wouldCreateCycle({
        fromId: "a",
        toId: "a",
        kind: "DEPENDS_ON",
        edges: [],
      }),
    ).toBe(true);
    expect(
      wouldCreateCycle({ fromId: "a", toId: "a", kind: "BLOCKS", edges: [] }),
    ).toBe(true);
  });

  it("allows a self-edge for non-directional kinds (no cycle semantics)", () => {
    expect(
      wouldCreateCycle({
        fromId: "a",
        toId: "a",
        kind: "RELATES_TO",
        edges: [],
      }),
    ).toBe(false);
    expect(
      wouldCreateCycle({
        fromId: "a",
        toId: "a",
        kind: "DUPLICATES",
        edges: [],
      }),
    ).toBe(false);
  });

  it("detects the simplest direct cycle (a→b, then b→a)", () => {
    const edges: LinkEdge[] = [{ fromId: "a", toId: "b", kind: "DEPENDS_ON" }];
    expect(
      wouldCreateCycle({ fromId: "b", toId: "a", kind: "DEPENDS_ON", edges }),
    ).toBe(true);
  });

  it("detects transitive cycles (a→b→c, then c→a)", () => {
    const edges: LinkEdge[] = [
      { fromId: "a", toId: "b", kind: "DEPENDS_ON" },
      { fromId: "b", toId: "c", kind: "BLOCKS" },
    ];
    expect(
      wouldCreateCycle({ fromId: "c", toId: "a", kind: "DEPENDS_ON", edges }),
    ).toBe(true);
  });

  it("ignores non-directional edges in the existing graph", () => {
    const edges: LinkEdge[] = [
      { fromId: "a", toId: "b", kind: "RELATES_TO" },
      { fromId: "b", toId: "c", kind: "DUPLICATES" },
    ];
    expect(
      wouldCreateCycle({ fromId: "c", toId: "a", kind: "DEPENDS_ON", edges }),
    ).toBe(false);
  });

  it("ignores non-directional kinds when checking the new edge's kind", () => {
    const edges: LinkEdge[] = [{ fromId: "a", toId: "b", kind: "DEPENDS_ON" }];
    expect(
      wouldCreateCycle({ fromId: "b", toId: "a", kind: "RELATES_TO", edges }),
    ).toBe(false);
    expect(
      wouldCreateCycle({ fromId: "b", toId: "a", kind: "DUPLICATES", edges }),
    ).toBe(false);
  });

  it("allows a non-cyclic addition in a complex graph", () => {
    const edges: LinkEdge[] = [
      { fromId: "a", toId: "b", kind: "DEPENDS_ON" },
      { fromId: "a", toId: "c", kind: "BLOCKS" },
      { fromId: "b", toId: "d", kind: "DEPENDS_ON" },
    ];
    expect(
      wouldCreateCycle({ fromId: "c", toId: "d", kind: "BLOCKS", edges }),
    ).toBe(false);
  });
});

describe("findCyclePath", () => {
  it("returns null when no cycle would form", () => {
    expect(
      findCyclePath({ fromId: "a", toId: "b", kind: "BLOCKS", edges: [] }),
    ).toBeNull();
  });

  it("names the path for a self-edge", () => {
    expect(
      findCyclePath({ fromId: "a", toId: "a", kind: "BLOCKS", edges: [] }),
    ).toEqual(["a", "a"]);
  });

  it("names the path for a direct cycle", () => {
    const edges: LinkEdge[] = [{ fromId: "a", toId: "b", kind: "BLOCKS" }];
    expect(
      findCyclePath({ fromId: "b", toId: "a", kind: "BLOCKS", edges }),
    ).toEqual(["b", "a", "b"]);
  });

  it("names the full path for a transitive cycle", () => {
    const edges: LinkEdge[] = [
      { fromId: "a", toId: "b", kind: "DEPENDS_ON" },
      { fromId: "b", toId: "c", kind: "BLOCKS" },
    ];
    expect(
      findCyclePath({ fromId: "c", toId: "a", kind: "DEPENDS_ON", edges }),
    ).toEqual(["c", "a", "b", "c"]);
  });

  it("reports the shortest cycle when several exist", () => {
    const edges: LinkEdge[] = [
      { fromId: "a", toId: "b", kind: "BLOCKS" },
      { fromId: "b", toId: "c", kind: "BLOCKS" },
      { fromId: "c", toId: "d", kind: "BLOCKS" },
      { fromId: "a", toId: "d", kind: "BLOCKS" },
    ];
    // d→a would close both a→b→c→d→a and a→d→a; BFS finds the short one.
    expect(
      findCyclePath({ fromId: "d", toId: "a", kind: "BLOCKS", edges }),
    ).toEqual(["d", "a", "d"]);
  });
});
