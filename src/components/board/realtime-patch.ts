/**
 * Fine-grained realtime patching (P3.9): `*.updated` sidecar events carry a
 * `patch` of the changed fields, so the board can update one task's sidecar
 * in place instead of a blanket router.refresh(). Pure — unit-tested.
 */

const SIDECAR_BY_EVENT = {
  "deal.updated": "deal",
  "bug.updated": "bugReport",
  "ticket.updated": "ticket",
  "initiative.updated": "initiative",
} as const;

type PatchableEvent = keyof typeof SIDECAR_BY_EVENT;

/** Sidecar fields stored as Date on the client (arrive as ISO over Pusher). */
const DATE_FIELDS = new Set([
  "expectedCloseAt",
  "slaDueAt",
  "firstResponseAt",
  "resolvedAt",
]);

interface BoardLike {
  columns: {
    tasks: ({ id: string } & Record<string, unknown>)[];
  }[];
}

function reviveDates(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    out[key] =
      DATE_FIELDS.has(key) && typeof value === "string"
        ? new Date(value)
        : value;
  }
  return out;
}

/**
 * Returns a new board with the task's sidecar merged, or null when the event
 * can't be patched (unknown event, no patch payload, task or sidecar not in
 * local state) — the caller falls back to a refresh.
 */
export function applySidecarPatch<B extends BoardLike>(
  board: B,
  event: string,
  payload: unknown,
): B | null {
  const sidecarKey = SIDECAR_BY_EVENT[event as PatchableEvent];
  if (!sidecarKey) return null;
  const p = payload as { taskId?: string; patch?: Record<string, unknown> };
  if (!p?.taskId || !p.patch || Object.keys(p.patch).length === 0) return null;

  let found = false;
  const columns = board.columns.map((c) => {
    const idx = c.tasks.findIndex((t) => t.id === p.taskId);
    if (idx === -1) return c;
    const task = c.tasks[idx];
    const sidecar = task[sidecarKey];
    if (!sidecar || typeof sidecar !== "object") return c; // not loaded → refresh
    found = true;
    const tasks = [...c.tasks];
    tasks[idx] = {
      ...task,
      [sidecarKey]: { ...sidecar, ...reviveDates(p.patch!) },
    };
    return { ...c, tasks };
  });
  if (!found) return null;
  return { ...board, columns };
}
