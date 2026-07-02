import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "./types";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5000,
  // Supabase direct connection requiere SSL en producción
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

// Fijar search_path en cada conexión nueva del pool
// Permite referenciar tablas sin prefijo accounting. en las queries de Kysely
pool.on("connect", (client) => {
  client
    .query("SET search_path TO accounting, public")
    .catch((err: unknown) => {
      console.error("[db] Error setting search_path:", err);
    });
});

pool.on("error", (err: Error) => {
  console.error("[db] Pool error:", err);
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

export { pool };
