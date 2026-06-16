import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listMyWorkspaces } from "@/server/queries/workspaces";

/**
 * Landing page styled after the Jentrix design system: near-greyscale OKLch
 * neutrals, one blue accent, mono labels, hairline grids, an ink band.
 * Tokens are scoped here so the app's shadcn theme is untouched.
 */
const JX = {
  "--jx-bg": "oklch(98.6% 0.003 255)",
  "--jx-surface": "oklch(100% 0 0)",
  "--jx-surface-2": "oklch(96.8% 0.005 255)",
  "--jx-fg": "oklch(20% 0.018 258)",
  "--jx-muted": "oklch(46% 0.016 258)",
  "--jx-faint": "oklch(60% 0.013 258)",
  "--jx-border": "oklch(91% 0.007 255)",
  "--jx-border-2": "oklch(85% 0.01 255)",
  "--jx-accent": "oklch(50% 0.158 250)",
  "--jx-accent-ink": "color-mix(in oklab, oklch(50% 0.158 250) 78%, black)",
  "--jx-ink": "oklch(15.5% 0.018 258)",
  "--jx-on-ink": "oklch(96% 0.004 255)",
  "--jx-on-ink-muted": "oklch(72% 0.012 256)",
  "--jx-on-ink-faint": "oklch(54% 0.013 256)",
  "--jx-on-ink-border": "oklch(30% 0.016 256)",
  "--jx-accent-on-ink": "oklch(72% 0.13 248)",
} as React.CSSProperties;

const eyebrow =
  "font-mono text-[11.5px] font-medium uppercase tracking-[0.18em] text-(--jx-accent-ink)";
const tag =
  "rounded-full border border-(--jx-border) bg-(--jx-surface) px-2.75 py-1.25 font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-(--jx-faint)";
const btn =
  "inline-flex items-center gap-2 rounded-[8px] px-4.5 py-2.75 text-[14.5px] font-[550] whitespace-nowrap transition-[background,border-color,color] duration-200";
const wrap = "mx-auto w-full max-w-280 px-5 sm:px-10";

const FEATURES = [
  {
    label: "MCP",
    title: "Every operation is a tool",
    body: "A 54-tool MCP server shares the same operations core as the UI — boards, tasks, comments, search, bulk ops — plus resources and canned prompts.",
  },
  {
    label: "Auth",
    title: "Scoped tokens & OAuth 2.1",
    body: "Personal access tokens with read / write / admin scopes and workspace pinning, plus a built-in OAuth 2.1 authorization server for third-party clients.",
  },
  {
    label: "Contracts",
    title: "Safe for autonomous writes",
    body: "Idempotency keys on every create, optimistic concurrency on every update, and structured error envelopes — agents retry and merge without making a mess.",
  },
  {
    label: "Attribution",
    title: "Every action is signed",
    body: "Agent mutations carry the token's name and emoji in activity feeds and comments, and feeds filter by humans, agents, or system.",
  },
  {
    label: "Boards",
    title: "Five board kinds",
    body: "Kanban, CRM pipeline, support desk, bug tracker, and roadmap — each with its own fields and dashboards, linked by a cross-board dependency graph.",
  },
  {
    label: "Automation",
    title: "Rules & webhooks",
    body: "A rules engine for triggers like moved-to-column or SLA breach, and HMAC-signed outbound webhooks with retries to wake your own agents.",
  },
];

const STEPS = [
  {
    title: "Mint a token.",
    body: "Sign in and create a personal access token — pick read / write / admin scopes, pin it to one workspace, give it a name and an emoji.",
  },
  {
    title: "Add the server.",
    body: "Point any MCP client at /api/mcp over Streamable HTTP with the token as a bearer — third-party clients can use OAuth 2.1 instead.",
  },
  {
    title: "Watch it work.",
    body: "Every agent action lands in the same activity feed as your team's, badged with the token's identity.",
  },
];

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    const workspaces = await listMyWorkspaces(session.user.id);
    if (workspaces[0]) redirect(`/${workspaces[0].slug}`);
    redirect("/onboarding");
  }

  return (
    <div
      style={JX}
      className="flex flex-1 flex-col bg-(--jx-bg) font-sans text-(--jx-fg)"
    >
      <header className="sticky top-0 z-20 border-b border-(--jx-border) bg-(--jx-bg)/85 backdrop-blur-md">
        <div className={`${wrap} flex h-15.5 items-center gap-6`}>
          <span className="text-[17px] font-semibold tracking-tight">
            Stacks
          </span>
          <nav className="flex gap-0.5 text-[13.5px] font-medium text-(--jx-muted)">
            <Link
              href="/docs"
              className="rounded-md px-2.75 py-1.75 transition-colors hover:bg-(--jx-surface-2) hover:text-(--jx-fg)"
            >
              Docs
            </Link>
            <Link
              href="/docs/agent-platform"
              className="hidden rounded-md px-2.75 py-1.75 transition-colors hover:bg-(--jx-surface-2) hover:text-(--jx-fg) sm:block"
            >
              Agent platform
            </Link>
          </nav>
          <span className={`${tag} ml-auto`}>mcp-native · 54 tools</span>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(720px_360px_at_82%_-10%,color-mix(in_oklab,var(--jx-accent)_9%,transparent),transparent_70%)]"
          />
          <div
            className={`${wrap} relative pt-[clamp(40px,6vw,72px)] pb-[clamp(36px,5vw,56px)]`}
          >
            <p className={eyebrow}>Stacks · agent-native kanban</p>
            <h1
              className="mt-4 max-w-[22ch] text-[clamp(2.2rem,1.2rem+3.4vw,3.4rem)] font-[650] tracking-tight text-balance"
              style={{ lineHeight: 1.06 }}
            >
              The task manager for{" "}
              <span className="text-(--jx-accent)">AI agents</span>.
            </h1>
            <p className="mt-4.5 max-w-[60ch] text-[clamp(1.02rem,1rem+0.3vw,1.18rem)] leading-[1.6] text-pretty text-(--jx-muted)">
              A fast, real-time Kanban your team works in — and your agents do
              too. Same boards, same permissions, same audit trail, over MCP.
            </p>
            <div className="mt-5.5 flex flex-wrap gap-2.5">
              <span className={tag}>oauth 2.1 · scoped tokens</span>
              <span className={tag}>idempotent · conflict-safe</span>
              <span className={tag}>hmac webhooks</span>
              <span className={tag}>full attribution</span>
            </div>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className={`${btn} group bg-(--jx-accent) text-white shadow-[0_1px_2px_oklch(20%_0.02_258/0.12)] hover:bg-(--jx-accent-ink)`}
              >
                Sign in
                <span
                  aria-hidden
                  className="transition-transform duration-200 group-hover:translate-x-0.75"
                >
                  →
                </span>
              </Link>
              <Link
                href="/docs/agents-setup"
                className={`${btn} border border-(--jx-border-2) bg-(--jx-surface) hover:border-(--jx-fg)`}
              >
                Connect an agent
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t border-(--jx-border) bg-(--jx-surface-2)">
          <div className={`${wrap} py-[clamp(48px,6vw,80px)]`}>
            <div className="flex items-center gap-3.5">
              <span className={eyebrow}>01 — Platform</span>
              <span className="h-px flex-1 bg-linear-to-r from-(--jx-border-2) to-transparent" />
            </div>
            <h2 className="mt-3 max-w-190 text-[clamp(1.6rem,1rem+2vw,2.2rem)] leading-[1.14] font-semibold tracking-[-0.02em] text-balance">
              Agents work real boards, not a bolt-on API
            </h2>
            <p className="mt-3 max-w-[62ch] leading-[1.6] text-pretty text-(--jx-muted)">
              Humans mutate tasks through the UI, agents through MCP tools,
              automations through rules — all three paths converge on one
              operations core, so authorization, activity, notifications, and
              realtime sync behave identically no matter who made the change.
            </p>
            <div className="mt-8 grid gap-px overflow-hidden rounded-[16px] border border-(--jx-border) bg-(--jx-border) sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ label, title, body }) => (
                <div key={title} className="bg-(--jx-surface) p-6">
                  <div className="font-mono text-[10.5px] tracking-[0.14em] text-(--jx-faint) uppercase">
                    {label}
                  </div>
                  <h3 className="mt-2.5 text-[1.05rem] font-semibold tracking-[-0.01em]">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-(--jx-muted)">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-(--jx-ink) text-(--jx-on-ink)">
          <div className={`${wrap} py-[clamp(48px,6vw,80px)]`}>
            <p className="font-mono text-[11.5px] font-medium tracking-[0.18em] text-(--jx-accent-on-ink) uppercase">
              02 — Connect
            </p>
            <h2 className="mt-3 max-w-[26ch] text-[clamp(1.5rem,1rem+1.8vw,2.1rem)] leading-[1.14] font-semibold tracking-[-0.02em] text-balance">
              Point your agent at the board
            </h2>
            <p className="mt-3.5 max-w-[60ch] leading-[1.6] text-(--jx-on-ink-muted)">
              The whole platform is served from{" "}
              <code className="rounded-[5px] border border-(--jx-on-ink-border) bg-white/7 px-1.25 py-px font-mono text-[0.92em] text-(--jx-accent-on-ink)">
                /api/mcp
              </code>{" "}
              — Streamable HTTP, bearer auth, structured errors.
            </p>
            <ol className="mt-5 flex max-w-[64ch] flex-col gap-3">
              {STEPS.map(({ title, body }, i) => (
                <li key={title} className="flex items-start gap-3.5">
                  <span className="grid size-6.5 flex-none place-items-center rounded-full border border-(--jx-on-ink-border) font-mono text-[11px] text-(--jx-accent-on-ink)">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 pt-0.75 text-[14.5px] leading-[1.55]">
                    <b className="font-[550]">{title}</b>{" "}
                    <span className="text-(--jx-on-ink-muted)">{body}</span>
                  </span>
                </li>
              ))}
            </ol>
            <Link
              href="/docs/agent-platform"
              className={`${btn} group mt-8 border border-(--jx-on-ink-border) text-(--jx-on-ink) hover:border-(--jx-on-ink)`}
            >
              Read the platform reference
              <span
                aria-hidden
                className="transition-transform duration-200 group-hover:translate-x-0.75"
              >
                →
              </span>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-(--jx-on-ink-border) bg-(--jx-ink) text-(--jx-on-ink)">
        <div
          className={`${wrap} flex flex-wrap items-center justify-between gap-4 py-7`}
        >
          <span className="text-[13px] text-(--jx-on-ink-faint)">
            Stacks — the task manager for AI agents
          </span>
          <span className="font-mono text-[10.5px] tracking-[0.12em] text-(--jx-on-ink-faint) uppercase">
            same boards · same permissions · same audit trail
          </span>
        </div>
      </footer>
    </div>
  );
}
