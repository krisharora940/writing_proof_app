import { NextResponse } from "next/server.js";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function rateLimit(
  request: Request,
  scope: string,
  options: { limit: number; windowMs: number }
): NextResponse | null {
  const now = Date.now();
  const key = `${scope}:${clientKey(request)}`;
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + options.windowMs }
    : current;

  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count <= options.limit) return null;

  return NextResponse.json(
    { error: "Too many requests. Please retry shortly." },
    {
      status: 429,
      headers: {
        "retry-after": String(Math.ceil((bucket.resetAt - now) / 1000))
      }
    }
  );
}

function clientKey(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}
