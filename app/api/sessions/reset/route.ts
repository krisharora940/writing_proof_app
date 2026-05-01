import { NextResponse } from "next/server.js";
import { forbidden, getAuthenticatedUser, unauthorized } from "@/lib/auth";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  if (user.role !== "student") return forbidden("Only students can access student session routes.");

  return NextResponse.json({
    error: "New attempts are disabled. Students receive one submission per assignment."
  }, { status: 410 });
}
