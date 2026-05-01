import { NextResponse } from "next/server.js";
import { getAuthenticatedUser, unauthorized } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorized();
  return NextResponse.json({ user });
}
