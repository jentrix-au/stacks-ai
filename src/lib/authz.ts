import { Role } from "@prisma/client";
import { restrictedWorkspaceId } from "./authz-context";
import { db } from "./db";

export class AuthzError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.name = "AuthzError";
    this.status = status;
  }
}

/**
 * Optimistic-concurrency rejection (P2.4): an `expectedUpdatedAt`
 * precondition failed. Carries the entity's CURRENT state so the caller
 * (MCP CONFLICT envelope) can hand the agent what it needs to merge
 * without an extra read.
 */
export class StaleWriteError extends AuthzError {
  current: unknown;
  constructor(message: string, current: unknown) {
    super(message, 409);
    this.name = "StaleWriteError";
    this.current = current;
  }
}

const ROLE_RANK: Record<Role, number> = {
  [Role.MEMBER]: 1,
  [Role.ADMIN]: 2,
  [Role.OWNER]: 3,
};

export function roleMeets(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

/**
 * Returns the caller's membership record for a workspace if they have at
 * least the given role; throws AuthzError otherwise. Use at the top of every
 * server action and route handler that touches workspace data.
 */
export async function requireWorkspaceRole(
  userId: string,
  workspaceId: string,
  required: Role = Role.MEMBER,
) {
  const restricted = restrictedWorkspaceId();
  if (restricted && restricted !== workspaceId) {
    throw new AuthzError(
      "This token is restricted to a single workspace and cannot access the requested resource",
    );
  }
  const member = await db.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (!member) throw new AuthzError("Not a member of this workspace");
  if (!roleMeets(member.role, required))
    throw new AuthzError(`Requires ${required} role or higher`);
  return member;
}

/**
 * Find the workspace that owns a given board, and check membership.
 * Archived boards are treated as "not found" so callers can't operate on
 * soft-deleted data through ID guesses.
 */
export async function requireBoardAccess(
  userId: string,
  boardId: string,
  required: Role = Role.MEMBER,
) {
  const board = await db.board.findFirst({
    where: { id: boardId, archivedAt: null },
    select: { id: true, workspaceId: true },
  });
  if (!board) throw new AuthzError("Board not found", 404);
  await requireWorkspaceRole(userId, board.workspaceId, required);
  return board;
}

/**
 * Find the workspace that owns a given task, and check membership.
 * Treats archived task/column/board as "not found" — soft-deleted data is
 * not mutable or readable through standard authz.
 */
export async function requireTaskAccess(
  userId: string,
  taskId: string,
  required: Role = Role.MEMBER,
) {
  const task = await db.task.findFirst({
    where: {
      id: taskId,
      archivedAt: null,
      column: {
        archivedAt: null,
        board: { archivedAt: null },
      },
    },
    select: {
      id: true,
      columnId: true,
      column: {
        select: { boardId: true, board: { select: { workspaceId: true } } },
      },
    },
  });
  if (!task) throw new AuthzError("Task not found", 404);
  await requireWorkspaceRole(userId, task.column.board.workspaceId, required);
  return task;
}

/** Find the workspace that owns a given contact, and check membership. */
export async function requireContactAccess(
  userId: string,
  contactId: string,
  required: Role = Role.MEMBER,
) {
  const contact = await db.contact.findUnique({
    where: { id: contactId },
    select: { id: true, workspaceId: true },
  });
  if (!contact) throw new AuthzError("Contact not found", 404);
  await requireWorkspaceRole(userId, contact.workspaceId, required);
  return contact;
}
