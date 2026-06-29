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

// Idempotent boot-time schema guard. Production databases that predate the
// LLM diamond columns are missing is_diamond/diamond_score/diamond_reason/
// viewed_at, which makes every /discoveries query fail. Running these here at
// startup (where DB connectivity is known-good) brings the table up to date
// without needing external/private-network access. All statements are
// IF NOT EXISTS, so this is safe to run on every boot.
export async function ensureSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE discoveries ADD COLUMN IF NOT EXISTS is_diamond boolean NOT NULL DEFAULT false;
    ALTER TABLE discoveries ADD COLUMN IF NOT EXISTS diamond_score numeric(5,2);
    ALTER TABLE discoveries ADD COLUMN IF NOT EXISTS diamond_reason text;
    ALTER TABLE discoveries ADD COLUMN IF NOT EXISTS viewed_at timestamptz;
    CREATE INDEX IF NOT EXISTS discoveries_diamond_idx ON discoveries (is_diamond);
    CREATE INDEX IF NOT EXISTS discoveries_viewed_idx ON discoveries (viewed_at);
  `);
}

export * from "./schema";
