/**
 * OpenAI Codex runtime — runs the same agents on a ChatGPT subscription.
 *
 * Auth: the SDK spawns the bundled `codex` binary, which reads the
 * credentials cached by `codex login` (~/.codex/auth.json). No OpenAI API
 * key needed. The Stacks MCP server is injected per-run via config
 * overrides — your global ~/.codex/config.toml is never edited.
 *
 * Tool surface parity with the Claude runtime: the shell tool, web search,
 * and image viewing are disabled and the sandbox is read-only, so the
 * agent's only world is the Stacks MCP tools (the PAT's scopes are enforced
 * server-side regardless — P2.1).
 */
import { Codex } from "@openai/codex-sdk";

import type { StacksAgentConfig, StacksConnection } from "../stacks.js";

export async function runCodexAgent(
  prompt: string,
  config: StacksAgentConfig,
  connection: StacksConnection,
): Promise<string> {
  const verbose = process.env.STACKS_AGENT_VERBOSE === "1";
  const codex = new Codex({
    config: {
      mcp_servers: {
        stacks: {
          url: connection.url,
          bearer_token_env_var: "STACKS_TOKEN",
        },
      },
      features: { shell_tool: false },
      tools: { web_search: false, view_image: false },
    },
  });
  const thread = codex.startThread({
    // Unset = Codex's current recommended model; STACKS_AGENT_MODEL pins one.
    ...(process.env.STACKS_AGENT_MODEL
      ? { model: process.env.STACKS_AGENT_MODEL }
      : {}),
    sandboxMode: "read-only",
    approvalPolicy: "never",
    skipGitRepoCheck: true,
  });

  // Codex threads take one prompt — the persona rides in front.
  const fullPrompt = `${config.systemPrompt}\n\n---\n\n${prompt}`;

  if (verbose) {
    const { events } = await thread.runStreamed(fullPrompt);
    let final = "";
    for await (const event of events) {
      if (event.type === "item.completed") {
        const item = event.item as { type?: string; text?: string };
        if (item.type === "agent_message" && item.text) final = item.text;
        console.error(`[codex] ${item.type ?? "item"}`);
      }
      if (event.type === "turn.failed") {
        throw new Error("Codex run failed");
      }
    }
    if (!final) throw new Error("Codex run ended without a final response");
    return final;
  }

  const turn = await thread.run(fullPrompt);
  if (!turn.finalResponse) {
    throw new Error("Codex run ended without a final response");
  }
  return turn.finalResponse;
}
