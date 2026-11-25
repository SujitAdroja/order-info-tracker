import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

// Reuse one pool across dev hot reloads.
const globalForDb = globalThis as unknown as { __keeptrackDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__keeptrackDb) {
    const client = postgres(env().DATABASE_URL, {
      max: env().NODE_ENV === "production" ? 5 : 3,
      prepare: false, // compatible with Supabase/Neon transaction poolers
    });
    globalForDb.__keeptrackDb = drizzle(client, { schema });
  }
  return globalForDb.__keeptrackDb;
}

export { schema };
