import { NextResponse } from "next/server";
import { compareSummaryToPaper } from "@/lib/summary-comparison";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!isComparisonRequest(body)) {
    return NextResponse.json({ error: "Invalid summary comparison request" }, { status: 400 });
  }

  return NextResponse.json(compareSummaryToPaper(body.submittedText, body.summaryText));
}

function isComparisonRequest(value: unknown): value is { submittedText: string; summaryText: string } {
  if (!value || typeof value !== "object") return false;
  const body = value as { submittedText?: unknown; summaryText?: unknown };

  return typeof body.submittedText === "string" && typeof body.summaryText === "string";
}
