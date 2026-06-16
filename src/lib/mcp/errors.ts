import { ZodError } from "zod";

import { AuthzError, StaleWriteError } from "@/lib/authz";
import { RateLimitError } from "@/lib/rate-limit";

/**
 * Machine-readable error envelope returned by every MCP tool (with
 * `isError: true`). `hint` tells the agent the next useful call instead of
 * leaving it to guess; `retryAfterSeconds` is present on RATE_LIMITED only.
 */
export type McpErrorCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "INTERNAL";

export interface McpErrorPayload {
  error: {
    code: McpErrorCode;
    message: string;
    hint?: string;
    retryAfterSeconds?: number;
    /** CONFLICT from a stale write: the entity's CURRENT state, for merging. */
    current?: unknown;
  };
}

export function errorPayload(
  code: McpErrorCode,
  message: string,
  hint?: string,
  retryAfterSeconds?: number,
): McpErrorPayload {
  return {
    error: {
      code,
      message,
      ...(hint !== undefined ? { hint } : {}),
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    },
  };
}

const DISCOVERY_HINT =
  "Check the ID. Call list_workspaces, then list_boards(workspaceId) / list_tasks(boardId) to discover valid IDs.";

function authzPayload(e: AuthzError): McpErrorPayload {
  switch (e.status) {
    case 404:
      return errorPayload("NOT_FOUND", e.message, DISCOVERY_HINT);
    case 400:
      return errorPayload(
        "INVALID_INPUT",
        e.message,
        "Adjust the arguments and retry.",
      );
    case 409:
      return errorPayload(
        "CONFLICT",
        e.message,
        "Re-read the entity to get its current state, then retry.",
      );
    default:
      return errorPayload(
        "FORBIDDEN",
        e.message,
        "Your user lacks the required role for this operation. Call list_workspaces to see your role per workspace.",
      );
  }
}

/**
 * Per-tool hint overrides: a tool can replace the generic hint for specific
 * error codes with one naming its own recovery path (e.g. update_deal's
 * INVALID_INPUT points at board kinds, not at generic argument fixing).
 */
export type HintOverrides = Partial<Record<McpErrorCode, string>>;

/** Map any thrown value to the structured MCP error envelope. */
export function toErrorPayload(
  e: unknown,
  hints?: HintOverrides,
): McpErrorPayload {
  const payload = basePayload(e);
  const override = hints?.[payload.error.code];
  if (override) payload.error.hint = override;
  return payload;
}

function basePayload(e: unknown): McpErrorPayload {
  if (e instanceof StaleWriteError) {
    const payload = errorPayload(
      "CONFLICT",
      e.message,
      "The entity changed since you read it. Merge your changes with `current` below, then retry passing current.updatedAt as expectedUpdatedAt.",
    );
    payload.error.current = e.current;
    return payload;
  }
  if (e instanceof RateLimitError) {
    return errorPayload(
      "RATE_LIMITED",
      e.message,
      `Wait ${e.retryAfterSeconds} seconds, then retry.`,
      e.retryAfterSeconds,
    );
  }
  if (e instanceof AuthzError) return authzPayload(e);
  if (e instanceof ZodError) {
    const fields = e.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return errorPayload(
      "INVALID_INPUT",
      `Invalid input — ${fields}`,
      "Fix the listed fields to match the tool's input schema and retry.",
    );
  }
  if (e instanceof Error) return errorPayload("INTERNAL", e.message);
  return errorPayload("INTERNAL", "Unknown error");
}
