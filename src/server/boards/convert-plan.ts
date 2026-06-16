import { BoardKind } from "@/lib/enums";

/**
 * Pure planning helper for board-kind conversion: which tasks need the
 * target kind's sidecar created. Conversion only ADDS the missing target
 * sidecar — existing sidecars of other kinds are preserved (their data may
 * be wanted again after converting back).
 */
export interface TaskSidecarFlags {
  id: string;
  hasDeal: boolean;
  hasBugReport: boolean;
  hasTicket: boolean;
  hasInitiative: boolean;
}

export function sidecarTaskIdsFor(
  kind: BoardKind,
  tasks: ReadonlyArray<TaskSidecarFlags>,
): string[] {
  switch (kind) {
    case BoardKind.CRM:
      return tasks.filter((t) => !t.hasDeal).map((t) => t.id);
    case BoardKind.BUGS:
      return tasks.filter((t) => !t.hasBugReport).map((t) => t.id);
    case BoardKind.SUPPORT:
      return tasks.filter((t) => !t.hasTicket).map((t) => t.id);
    case BoardKind.ROADMAP:
      return tasks.filter((t) => !t.hasInitiative).map((t) => t.id);
    case BoardKind.TASKS:
      return [];
  }
}
