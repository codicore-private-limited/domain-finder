import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Render's managed Postgres requires TLS when the service connects via the
// external connection string. Locally / on Replit we usually connect to a
// plain Postgres, so only opt in when the URL clearly needs it (or when the
// operator forces it via PGSSL=require).
const url = process.env.DATABASE_URL;
const forceSsl = process.env["PGSSL"] === "require";
const looksRemote =
  /sslmode=require/i.test(url) ||
  /\.render\.com(?::|\/|$)/i.test(url) ||
  /\.neon\.tech(?::|\/|$)/i.test(url) ||
  /\.supabase\.co(?::|\/|$)/i.test(url);

export const pool = new Pool({
  connectionString: url,
  ...(forceSsl || looksRemote
    ? { ssl: { rejectUnauthorized: false } }
    : {}),
});

// A pooled Postgres client can be dropped by the server at any time (idle
// timeout, failover, maintenance, network blip). node-postgres surfaces that as
// an 'error' event on the pool. With NO listener attached, Node treats it as an
// uncaught exception and would crash the process. Log it instead — the pool
// transparently opens a fresh connection on the next query, so this is
// non-fatal and is exactly what keeps the service alive 24/7.
pool.on("error", (err) => {
  console.error("[db] idle postgres client error (pool will recover):", err);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
