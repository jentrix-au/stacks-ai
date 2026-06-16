import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

import { runWithWorkspaceRestriction } from "@/lib/authz-context";
import { scopeViolation } from "@/lib/mcp/scopes";
import {
  allowedWorkspaceId,
  rateLimitInfo,
  requireUserId,
  type ToolExtra,
} from "@/lib/mcp/tools";
import {
  getMcpBoardSnapshot,
  getMcpTaskByKey,
  getMcpWorkspaceOverview,
  listMcpWorkspaces,
} from "@/server/queries/mcp-context";

// MCP resources (P2.5): cheap read-only context an agent can attach without
// burning tool calls. Same auth model as tools — "read" scope required,
// workspace-scoped tokens pinned via the authz restriction context.
// Resources have no isError channel, so guard failures throw (the client
// sees a JSON-RPC error with the message).

async function guarded<T>(extra: ToolExtra, fn: () => Promise<T>): Promise<T> {
  const rateLimit = rateLimitInfo(extra);
  if (rateLimit) {
    throw new Error(
      `Rate limit exceeded — retry in ${rateLimit.retryAfterSeconds} seconds`,
    );
  }
  const violation = scopeViolation(extra.authInfo?.scopes, "read");
  if (violation) throw new Error(violation.error.message);
  return runWithWorkspaceRestriction(allowedWorkspaceId(extra), fn);
}

function jsonContents(uri: URL, value: unknown): ReadResourceResult {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(value),
      },
    ],
  };
}

export function registerResources(server: McpServer) {
  server.registerResource(
    "workspace-overview",
    new ResourceTemplate("stacks://workspace/{id}", {
      // Enumerate the caller's workspaces so inspectors show concrete URIs.
      list: async (extra) =>
        guarded(extra as ToolExtra, async () => {
          const workspaces = await listMcpWorkspaces(
            requireUserId(extra as ToolExtra),
          );
          return {
            resources: workspaces.map((w) => ({
              uri: `stacks://workspace/${w.id}`,
              name: w.name,
              description: `Workspace overview for "${w.name}" (${w.slug}): boards, members, counts`,
              mimeType: "application/json",
            })),
          };
        }),
    }),
    {
      title: "Workspace overview",
      description:
        "Boards + members + open-task counts for one workspace in a single cheap read.",
      mimeType: "application/json",
    },
    async (uri, variables, extra) =>
      guarded(extra as ToolExtra, async () =>
        jsonContents(
          uri,
          await getMcpWorkspaceOverview(
            requireUserId(extra as ToolExtra),
            String(variables.id),
          ),
        ),
      ),
  );

  server.registerResource(
    "board-snapshot",
    new ResourceTemplate("stacks://board/{id}", { list: undefined }),
    {
      title: "Board snapshot",
      description:
        "Concise board snapshot: columns with task keys/titles/priorities (same shape as the get_board_snapshot tool).",
      mimeType: "application/json",
    },
    async (uri, variables, extra) =>
      guarded(extra as ToolExtra, async () =>
        jsonContents(
          uri,
          await getMcpBoardSnapshot(
            requireUserId(extra as ToolExtra),
            String(variables.id),
          ),
        ),
      ),
  );

  server.registerResource(
    "task",
    new ResourceTemplate("stacks://task/{key}", { list: undefined }),
    {
      title: "Task by key",
      description:
        "Full task detail addressed by its human-readable key, e.g. stacks://task/STK-42.",
      mimeType: "application/json",
    },
    async (uri, variables, extra) =>
      guarded(extra as ToolExtra, async () =>
        jsonContents(
          uri,
          await getMcpTaskByKey(
            requireUserId(extra as ToolExtra),
            String(variables.key),
          ),
        ),
      ),
  );
}
