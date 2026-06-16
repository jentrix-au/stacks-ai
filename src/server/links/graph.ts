/**
 * Pure helpers for the universal task-link graph (any board kind).
 *
 * Edges of kind BLOCKS and DEPENDS_ON are directional (from → to) and
 * participate in cycle detection. RELATES_TO and DUPLICATES are markers —
 * they do NOT contribute to a cycle.
 */

export type LinkKind = "BLOCKS" | "DEPENDS_ON" | "RELATES_TO" | "DUPLICATES";

export const DIRECTIONAL_LINK_KINDS: ReadonlyArray<LinkKind> = [
  "BLOCKS",
  "DEPENDS_ON",
];

export interface LinkEdge {
  fromId: string;
  toId: string;
  kind: LinkKind;
}

export function isDirectionalKind(kind: LinkKind): boolean {
  return kind === "BLOCKS" || kind === "DEPENDS_ON";
}

/**
 * If adding a new directional edge `from → to` would close a cycle, return
 * the full cycle path as node ids `[from, to, …, from]`; otherwise null.
 *
 * A cycle exists when `to` can already reach `from` via directional edges.
 * A self-edge (from === to) returns `[from, from]`. Non-directional kinds
 * (RELATES_TO / DUPLICATES) never cycle and existing non-directional edges
 * are ignored.
 *
 * Workspace task counts are bounded (~hundreds), so an O(V+E) BFS in memory
 * is more than sufficient. BFS (not DFS) so the reported path is shortest.
 */
export function findCyclePath(args: {
  fromId: string;
  toId: string;
  kind: LinkKind;
  edges: ReadonlyArray<LinkEdge>;
}): string[] | null {
  if (!isDirectionalKind(args.kind)) return null;
  if (args.fromId === args.toId) return [args.fromId, args.fromId];

  // Adjacency map from existing directional edges only.
  const adj = new Map<string, string[]>();
  for (const e of args.edges) {
    if (!isDirectionalKind(e.kind)) continue;
    const list = adj.get(e.fromId);
    if (list) list.push(e.toId);
    else adj.set(e.fromId, [e.toId]);
  }

  // BFS from `toId` towards `fromId`, tracking parents to rebuild the path.
  const parent = new Map<string, string>();
  const queue: string[] = [args.toId];
  const visited = new Set<string>([args.toId]);
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node === args.fromId) {
      // Reconstruct toId → … → fromId, then prepend the new edge.
      const tail: string[] = [];
      for (let n: string | undefined = node; n; n = parent.get(n)) {
        tail.unshift(n);
      }
      return [args.fromId, ...tail];
    }
    for (const next of adj.get(node) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      parent.set(next, node);
      queue.push(next);
    }
  }
  return null;
}

/** Boolean convenience wrapper over findCyclePath. */
export function wouldCreateCycle(args: {
  fromId: string;
  toId: string;
  kind: LinkKind;
  edges: ReadonlyArray<LinkEdge>;
}): boolean {
  return findCyclePath(args) !== null;
}
