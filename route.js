// app/api/sync-clans/route.js
import { NextResponse } from "next/server";
import { syncClans } from "../../lib/clan-source.mjs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request) {
  // Use the same check your /api/monitor route uses if it differs from this one.
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    return NextResponse.json({ ok: true, ...(await syncClans()) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 502 });
  }
}
