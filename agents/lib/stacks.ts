/**
 * Shared plumbing for the Stacks reference agents (P4.2).
 *
 * Every agent talks to Stacks EXCLUSIVELY through the MCP server — the same
 * surface any third-party agent uses — authenticated by a PAT minted on
 * /account/tokens. No filesystem or bash tools are allowed: the agent's
 * world is the Stacks tool surface.
 *
 * Two interchangeable runtimes (STACKS_AGENT_PROVIDER):
 *   "claude" (default) — Claude Agent SDK; needs ANTHROPIC_API_KEY.
 *   "codex"            — OpenAI Codex SDK; uses your `codex login`
 *                        credentials (ChatGPT subscription, no API key).
 * Same prompts, same MCP server, same badges — the Stacks platform is
 * runtime-neutral by construction.
 */
import { runClaudeAgent } from "./providers/claude.js";
import { runCodexAgent } from "./providers/codex.js";

export interface StacksAgentConfig {
  /** Agent persona + task rules. Keep it short; the tools carry the schema. */
  systemPrompt: string;
  /**
   * Upper bound on agentic turns — a runaway guard, not a target.
   * Claude-only: Codex manages its own loop budget.
   */
  maxTurns?: number;
}

export interface StacksConnection {
  url: string;
  token: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `Missing ${name}. Copy agents/.env.example to agents/.env and fill it in ` +
        `(export the vars or use \`node --env-file=.env\`).`,
    );
    process.exit(1);
  }
  return value;
}

export function stacksConnection(): StacksConnection {
  return {
    url: process.env.STACKS_MCP_URL ?? "http://localhost:3000/api/mcp",
    token: requireEnv("STACKS_TOKEN"),
  };
}

export type AgentProvider = "claude" | "codex";

export function agentProvider(): AgentProvider {
  const raw = process.env.STACKS_AGENT_PROVIDER ?? "claude";
  if (raw === "claude" || raw === "codex") return raw;
  console.error(
    `Unknown STACKS_AGENT_PROVIDER "${raw}" — use "claude" (Claude Agent SDK, ` +
      `ANTHROPIC_API_KEY) or "codex" (OpenAI Codex SDK, \`codex login\`).`,
  );
  process.exit(1);
}

/**
 * Run one agent task to completion on the configured runtime and return the
 * final result text. Streams progress to stderr when STACKS_AGENT_VERBOSE=1.
 */
export async function runStacksAgent(
  prompt: string,
  config: StacksAgentConfig,
): Promise<string> {
  const connection = stacksConnection();
  return agentProvider() === "codex"
    ? runCodexAgent(prompt, config, connection)
    : runClaudeAgent(prompt, config, connection);
}

/** ISO timestamp for "N hours ago" — used for list_activity `since` params. */
export function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}
