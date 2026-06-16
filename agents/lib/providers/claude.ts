/**
 * Claude Agent SDK runtime (the default). Auth: ANTHROPIC_API_KEY from the
 * environment (or a local Claude Code login).
 */
import { query, type Options } from "@anthropic-ai/claude-agent-sdk";

import type { StacksAgentConfig, StacksConnection } from "../stacks.js";

function claudeOptions(
  config: StacksAgentConfig,
  connection: StacksConnection,
): Options {
  return {
    model: process.env.STACKS_AGENT_MODEL ?? "claude-opus-4-8",
    systemPrompt: config.systemPrompt,
    maxTurns: config.maxTurns ?? 30,
    mcpServers: {
      stacks: {
        type: "http",
        url: connection.url,
        headers: { Authorization: `Bearer ${connection.token}` },
      },
    },
    // The Stacks tool surface and nothing else — no Read/Write/Bash. Scope
    // enforcement also happens server-side via the token's scopes (P2.1).
    allowedTools: ["mcp__stacks__*"],
  };
}

export async function runClaudeAgent(
  prompt: string,
  config: StacksAgentConfig,
  connection: StacksConnection,
): Promise<string> {
  const verbose = process.env.STACKS_AGENT_VERBOSE === "1";
  for await (const message of query({
    prompt,
    options: claudeOptions(config, connection),
  })) {
    if (verbose && message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") console.error(`[agent] ${block.text}`);
        if (block.type === "tool_use") console.error(`[tool] ${block.name}`);
      }
    }
    if (message.type === "result") {
      if (message.subtype === "success") return message.result;
      throw new Error(`Agent run failed: ${message.subtype}`);
    }
  }
  throw new Error("Agent run ended without a result message");
}
