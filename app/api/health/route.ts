import { NextResponse } from "next/server.js";
import { getDatabaseClient } from "@/lib/db";
import { hasRequiredProductionEnv } from "@/lib/request-security";

export async function GET() {
  const env = hasRequiredProductionEnv();
  const databaseReachable = await checkDatabase();
  const ready = databaseReachable && Object.values(env).every(Boolean);

  return NextResponse.json(
    {
      ok: ready,
      checks: {
        databaseReachable,
        env
      }
    },
    { status: ready ? 200 : 503 }
  );
}

async function checkDatabase() {
  try {
    await getDatabaseClient().query("select 1");
    return true;
  } catch {
    return false;
  }
}
