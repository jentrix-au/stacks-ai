import { describe, expect, it } from "vitest";

import { runWithMcpRequestContext } from "@/lib/authz-context";
import { withSource } from "./activity";

describe("withSource attribution (P2.8)", () => {
  it("ui activities carry only the source", () => {
    expect(withSource({ taskId: "t1" }, "ui")).toEqual({
      taskId: "t1",
      source: "ui",
    });
  });

  it("mcp without request context (defensive) carries only the source", () => {
    expect(withSource({}, "mcp")).toEqual({ source: "mcp" });
  });

  it("mcp inside the request context carries tokenId + tokenName", () => {
    const payload = runWithMcpRequestContext(
      { tokenId: "tok_1", tokenName: "Claude Desktop" },
      () => withSource({ taskId: "t1" }, "mcp"),
    );
    expect(payload).toEqual({
      taskId: "t1",
      source: "mcp",
      tokenId: "tok_1",
      tokenName: "Claude Desktop",
    });
  });

  it("ui inside an MCP context never picks up attribution (UI shims)", () => {
    const payload = runWithMcpRequestContext(
      { tokenId: "tok_1", tokenName: "X" },
      () => withSource({}, "ui"),
    );
    expect(payload).toEqual({ source: "ui" });
  });

  it("agent identity (P4.1) is snapshotted when the token carries one", () => {
    const payload = runWithMcpRequestContext(
      {
        tokenId: "tok_1",
        tokenName: "Claude Desktop",
        tokenDisplayName: "Triage Bot",
        tokenEmoji: "🛠️",
      },
      () => withSource({}, "mcp"),
    );
    expect(payload).toEqual({
      source: "mcp",
      tokenId: "tok_1",
      tokenName: "Claude Desktop",
      tokenDisplayName: "Triage Bot",
      tokenEmoji: "🛠️",
    });
  });

  it("identity fields are omitted (not null) when the token has none", () => {
    const payload = runWithMcpRequestContext(
      { tokenId: "tok_1", tokenName: "Claude Desktop" },
      () => withSource({}, "mcp"),
    ) as Record<string, unknown>;
    expect("tokenDisplayName" in payload).toBe(false);
    expect("tokenEmoji" in payload).toBe(false);
  });
});
