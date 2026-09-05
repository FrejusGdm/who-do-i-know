import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { databaseConfig } from "./config";
import * as schema from "./schema";

let _db: NodePgDatabase<typeof schema> | null = null;
let pool: Pool | null = null;

function getDb(): NodePgDatabase<typeof schema> {
  if (!_db) {
    pool = new Pool(databaseConfig());
    // Do not log the error object: it can contain credentials or SQL parameters.
    pool.on("error", () => console.error("Database connection failed"));
    _db = drizzle(pool, { schema });
  }
  return _db;
}

export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop) {
    const instance = getDb();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});

export async function closeDatabase() {
  await pool?.end();
  pool = null;
  _db = null;
}
