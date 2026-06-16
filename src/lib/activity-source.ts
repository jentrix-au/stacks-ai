/**
 * Activity-payload source helpers (P4.1). Plain module (no "use client") so
 * the client activity feed and server-rendered pages share one parser —
 * same rule as activity-verbs.ts.
 *
 * Payload `source` values in the wild: "ui" | "mcp" (P0.4), "automation"
 * (P3.7 rule actions), "system" (P3.6 sweep), and absent on pre-P0.4 rows
 * (UI-only era — treated as human).
 */

export type ActivitySourceFilter = "all" | "humans" | "agents" | "system";

export const ACTIVITY_SOURCE_FILTERS: {
  value: ActivitySourceFilter;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "humans", label: "Humans" },
  { value: "agents", label: "Agents" },
  { value: "system", label: "System" },
];

interface SourcedPayload {
  source?: string;
  tokenName?: string;
  tokenDisplayName?: string;
  tokenEmoji?: string;
}

function asPayload(payload: unknown): SourcedPayload {
  return payload && typeof payload === "object"
    ? (payload as SourcedPayload)
    : {};
}

/**
 * The agent identity to badge an MCP-sourced row with, or null for
 * non-agent rows. Name prefers the token's teammate-facing displayName
 * (P4.1) over its raw token name; emoji is null when unset (render 🤖).
 */
export function agentIdentityOf(
  payload: unknown,
): { name: string; emoji: string | null } | null {
  const p = asPayload(payload);
  if (p.source !== "mcp") return null;
  return {
    name: p.tokenDisplayName ?? p.tokenName ?? "API token",
    emoji: p.tokenEmoji ?? null,
  };
}

/** Whether an activity row passes the feed's source filter. */
export function matchesSourceFilter(
  payload: unknown,
  filter: ActivitySourceFilter,
): boolean {
  if (filter === "all") return true;
  const source = asPayload(payload).source;
  switch (filter) {
    case "humans":
      // Absent source = pre-P0.4 row, which only the UI could have written.
      return source === "ui" || source === undefined;
    case "agents":
      return source === "mcp";
    case "system":
      return source === "automation" || source === "system";
  }
}
