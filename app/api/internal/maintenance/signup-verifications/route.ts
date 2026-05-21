import { NextResponse } from "next/server.js";
import { cleanupExpiredSignupVerifications } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const deletedCount = await cleanupExpiredSignupVerifications(getDatabaseClient());
  return NextResponse.json({ ok: true, deletedCount });
}
