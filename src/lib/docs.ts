import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The in-app documentation surface. Source of truth stays in `docs/*.md`
 * (readable on GitHub as-is); these entries define routing, nav order, and
 * page metadata for the rendered version at /docs. A unit test asserts the
 * manifest and the directory stay in sync.
 */
export interface DocEntry {
  slug: string;
  file: string;
  title: string;
  description: string;
}

export const DOCS: DocEntry[] = [
  {
    slug: "getting-started",
    file: "getting-started.md",
    title: "Getting started",
    description: "Local setup, environment variables, seeding, signing in.",
  },
  {
    slug: "user-guide",
    file: "user-guide.md",
    title: "User guide",
    description:
      "Boards and kinds, tasks, filters, saved views, search, inbox, dashboards, import/export.",
  },
  {
    slug: "automations",
    file: "automations.md",
    title: "Automations",
    description: "The rules engine: triggers, actions, and the loop guard.",
  },
  {
    slug: "webhooks",
    file: "webhooks.md",
    title: "Webhooks",
    description: "Outbound events, HMAC verification, retries, security.",
  },
  {
    slug: "agent-platform",
    file: "agent-platform.md",
    title: "Agent platform",
    description:
      "The MCP server: tokens, scopes, the tool catalog, idempotency, OAuth 2.1.",
  },
  {
    slug: "agents-setup",
    file: "agents-setup.md",
    title: "Agent setup variants",
    description:
      "Connecting Claude Code, claude.ai, Codex, Cursor, custom agents, and the reference agents.",
  },
  {
    slug: "deployment",
    file: "deployment.md",
    title: "Deployment",
    description: "Vercel + Neon production setup, env vars, cron jobs.",
  },
];

/** docs/README.md renders as the /docs index page. */
export const DOCS_INDEX_FILE = "README.md";

export function docBySlug(slug: string): DocEntry | undefined {
  return DOCS.find((d) => d.slug === slug);
}

export async function loadDocSource(file: string): Promise<string> {
  return readFile(path.join(process.cwd(), "docs", file), "utf8");
}
