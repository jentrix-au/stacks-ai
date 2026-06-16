import { NextResponse } from "next/server";

import { drainDueDeliveries } from "@/lib/webhooks/deliver";

/**
 * Vercel cron (every 5 min, see vercel.json): retries webhook deliveries
 * whose backoff has elapsed. Guarded by CRON_SECRET — Vercel sends it as
 * `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const drained = await drainDueDeliveries();
  return NextResponse.json({ drained });
}

export const runtime = "nodejs";
export const maxDuration = 60;
