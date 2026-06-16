import { NextResponse } from "next/server";

import { runDailyDigest } from "@/server/cron/daily-digest";

/**
 * Vercel cron (daily, see vercel.json): emails each opted-in user a digest
 * of their unread notifications from the last 24h. CRON_SECRET-guarded.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runDailyDigest(new Date());
  return NextResponse.json(summary);
}

export const runtime = "nodejs";
export const maxDuration = 60;
