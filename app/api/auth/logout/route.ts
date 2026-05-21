import { NextResponse } from "next/server.js";
import { clearSessionCookie } from "@/lib/auth";
import { enforceSameOrigin } from "@/lib/request-security";

export async function POST(request: Request) {
  const blocked = enforceSameOrigin(request, { requireOrigin: true });
  if (blocked) return blocked;
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
