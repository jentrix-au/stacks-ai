import { NextResponse } from "next/server";

import { runSweep } from "@/server/cron/sweep";

/**
 * Vercel cron (every 5 min, see vercel.json): due-soon/overdue reminders,
 * SLA breaches, idempotency-key TTL sweep, webhook retry drain. Guarded by
 * CRON_SECRET — Vercel sends it as `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runSweep(new Date());
  return NextResponse.json(summary);
}

export const runtime = "nodejs";
export const maxDuration = 60;
