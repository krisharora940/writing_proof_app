import { NextResponse } from "next/server";
import { reconstructReplay } from "@/lib/replay";
import type { Snapshot, WritingEvent } from "@/lib/writing-events";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!isReplayRequest(body)) {
    return NextResponse.json({ error: "Invalid replay request" }, { status: 400 });
  }

  return NextResponse.json({
    frames: reconstructReplay(body.snapshots, body.events)
  });
}

function isReplayRequest(value: unknown): value is { snapshots: Snapshot[]; events: WritingEvent[] } {
  if (!value || typeof value !== "object") return false;
  const body = value as { snapshots?: unknown; events?: unknown };

  return Array.isArray(body.snapshots) && Array.isArray(body.events);
}
