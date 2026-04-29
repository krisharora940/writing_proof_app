import { Pool } from "pg";
import type { QueryClient } from "./postgres-repository";

type GlobalWithPool = typeof globalThis & {
  verifiedWritingPool?: Pool;
};

export function hasDatabaseUrl(env?: Record<string, string | undefined>) {
  const target = env || process.env;
  return typeof target.DATABASE_URL === "string" && target.DATABASE_URL.trim().length > 0;
}

export function getDatabaseClient(): QueryClient {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const globalWithPool = globalThis as GlobalWithPool;
  globalWithPool.verifiedWritingPool ||= new Pool({
    connectionString: process.env.DATABASE_URL
  });

  return globalWithPool.verifiedWritingPool;
}
