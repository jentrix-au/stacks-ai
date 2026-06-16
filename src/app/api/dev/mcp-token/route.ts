import { NextResponse } from "next/server";

import { generateToken } from "@/lib/api-tokens";
import { db } from "@/lib/db";

/**
 * Dev-only PAT mint for e2e tests (same pattern as /api/dev/sign-in):
 * issues a short-lived full-scope token for the demo user so Playwright can
 * exercise the real MCP HTTP stack. Disabled in production.
 *
 * POST /api/dev/mcp-token
 *   body: { name?: string }
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Disabled", { status: 404 });
  }

  let name = "e2e agent";
  let displayName: string | null = null;
  let emoji: string | null = null;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      displayName?: string;
      emoji?: string;
    };
    if (body.name) name = body.name.slice(0, 80);
    if (body.displayName) displayName = body.displayName.slice(0, 80);
    if (body.emoji) emoji = body.emoji.slice(0, 16);
  } catch {
    // ignore — use default
  }

  const user = await db.user.findUnique({
    where: { email: "demo@stacks.local" },
  });
  if (!user) {
    return NextResponse.json(
      { error: "Demo user missing — run `pnpm db:seed`." },
      { status: 404 },
    );
  }

  // Re-mints are idempotent: drop older tokens with the same name so e2e
  // re-runs against a persistent dev DB don't accumulate duplicate rows
  // (tokens are user-scoped and survive the seed's workspace reset).
  await db.apiToken.deleteMany({ where: { userId: user.id, name } });

  const { token, hash, prefix } = generateToken();
  const row = await db.apiToken.create({
    data: {
      userId: user.id,
      name,
      tokenHash: hash,
      tokenPrefix: prefix,
      scopes: ["read", "write", "admin"],
      displayName,
      emoji,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, token, tokenId: row.id });
}
