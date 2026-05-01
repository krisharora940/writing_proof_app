import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";
import { getDatabaseClient, hasDatabaseUrl } from "@/lib/db";
import { exportProfessorReportPostgres } from "@/lib/postgres-repository";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeReportExportFormat } from "@/lib/report-export";
import { exportProfessorReportDemo, getDemoRepositoryState } from "@/lib/server-repository";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const limited = rateLimit(request, "report-export", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "professor") return forbidden("Only professors can export reports.");

  const { sessionId } = await context.params;
  const format = normalizeReportExportFormat(new URL(request.url).searchParams.get("format"));
  const result = hasDatabaseUrl()
    ? await exportProfessorReportPostgres(getDatabaseClient(), sessionId, user.id, format)
    : exportProfessorReportDemo(getDemoRepositoryState(), sessionId, user.id, format);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const body = typeof result.value.body === "string"
    ? result.value.body
    : new Blob([toArrayBuffer(result.value.body)], { type: result.value.contentType });

  return new NextResponse(body, {
    headers: {
      "content-type": result.value.contentType,
      "content-disposition": `attachment; filename="${result.value.filename}"`
    }
  });
}

function toArrayBuffer(bytes: Uint8Array) {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return arrayBuffer;
}
