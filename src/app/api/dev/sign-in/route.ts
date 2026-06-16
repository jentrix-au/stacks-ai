import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

/**
 * Dev-only sign-in. Looks up (or refuses to create) the demo user, opens a
 * real Auth.js DB session, and sets the session cookie. Disabled in
 * production.
 *
 * POST /api/dev/sign-in
 *   body: { email?: string }   // defaults to demo@stacks.local
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Disabled", { status: 404 });
  }

  let email = "demo@stacks.local";
  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string };
    if (body.email) email = body.email.toLowerCase();
  } catch {
    // ignore — use default
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json(
      {
        error: `No user with email ${email}. Run \`pnpm db:seed\` to create demo@stacks.local.`,
      },
      { status: 404 },
    );
  }

  // Reuse a session if one is fresh, else create a new one.
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const expires = new Date(Date.now() + thirtyDays);

  const sessionToken =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);

  await db.session.create({
    data: { sessionToken, userId: user.id, expires },
  });

  const isSecure = req.url.startsWith("https://");
  const cookieName = isSecure
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  const jar = await cookies();
  jar.set({
    name: cookieName,
    value: sessionToken,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isSecure,
    expires,
  });

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name },
  });
}
