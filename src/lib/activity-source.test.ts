import { describe, expect, it } from "vitest";

import { agentIdentityOf, matchesSourceFilter } from "./activity-source";

describe("agentIdentityOf (P4.1)", () => {
  it("returns null for non-MCP payloads", () => {
    expect(agentIdentityOf({ source: "ui" })).toBeNull();
    expect(agentIdentityOf({ source: "automation" })).toBeNull();
    expect(agentIdentityOf({ source: "system" })).toBeNull();
    expect(agentIdentityOf({})).toBeNull();
    expect(agentIdentityOf(null)).toBeNull();
    expect(agentIdentityOf("garbage")).toBeNull();
  });

  it("prefers displayName over tokenName, falls back to a generic label", () => {
    expect(
      agentIdentityOf({
        source: "mcp",
        tokenName: "Claude Desktop",
        tokenDisplayName: "Triage Bot",
        tokenEmoji: "🛠️",
      }),
    ).toEqual({ name: "Triage Bot", emoji: "🛠️" });
    expect(
      agentIdentityOf({ source: "mcp", tokenName: "Claude Desktop" }),
    ).toEqual({ name: "Claude Desktop", emoji: null });
    expect(agentIdentityOf({ source: "mcp" })).toEqual({
      name: "API token",
      emoji: null,
    });
  });
});

describe("matchesSourceFilter (P4.1)", () => {
  it("'all' matches everything", () => {
    for (const payload of [
      { source: "ui" },
      { source: "mcp" },
      { source: "automation" },
      { source: "system" },
      {},
      null,
    ]) {
      expect(matchesSourceFilter(payload, "all")).toBe(true);
    }
  });

  it("'humans' matches ui and legacy rows without a source", () => {
    expect(matchesSourceFilter({ source: "ui" }, "humans")).toBe(true);
    expect(matchesSourceFilter({}, "humans")).toBe(true);
    expect(matchesSourceFilter(null, "humans")).toBe(true);
    expect(matchesSourceFilter({ source: "mcp" }, "humans")).toBe(false);
    expect(matchesSourceFilter({ source: "automation" }, "humans")).toBe(false);
  });

  it("'agents' matches only mcp", () => {
    expect(matchesSourceFilter({ source: "mcp" }, "agents")).toBe(true);
    expect(matchesSourceFilter({ source: "ui" }, "agents")).toBe(false);
    expect(matchesSourceFilter({}, "agents")).toBe(false);
  });

  it("'system' matches automation and system rows", () => {
    expect(matchesSourceFilter({ source: "automation" }, "system")).toBe(true);
    expect(matchesSourceFilter({ source: "system" }, "system")).toBe(true);
    expect(matchesSourceFilter({ source: "ui" }, "system")).toBe(false);
    expect(matchesSourceFilter({ source: "mcp" }, "system")).toBe(false);
  });
});
