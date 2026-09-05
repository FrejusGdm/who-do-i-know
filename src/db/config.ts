import { readFileSync } from "node:fs";

/** Remote connections always verify TLS, including when a legacy Neon URL says sslmode=require. */
export function databaseConfig(env: Record<string, string | undefined> = process.env) {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const url = new URL(env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Invalid database protocol");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (env.NODE_ENV === "production" && local) throw new Error("Production database must use verified TLS");
  for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(key);
  const max = Number(env.DATABASE_POOL_SIZE ?? 5);
  if (!Number.isInteger(max) || max < 1 || max > 30) throw new Error("Invalid database pool size");
  return {
    connectionString: url.toString(),
    ssl: local ? false as const : {
      rejectUnauthorized: true,
      ...(env.DATABASE_CA_FILE ? { ca: readFileSync(env.DATABASE_CA_FILE, "utf8") } : {}),
    },
    max,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  };
}
