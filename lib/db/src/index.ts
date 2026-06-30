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
  // 1) Add columns the current code expects (safe if they already exist).
  await pool.query(`
    ALTER TABLE discoveries ADD COLUMN IF NOT EXISTS is_diamond boolean NOT NULL DEFAULT false;
    ALTER TABLE discoveries ADD COLUMN IF NOT EXISTS diamond_score numeric(5,2);
    ALTER TABLE discoveries ADD COLUMN IF NOT EXISTS diamond_reason text;
    ALTER TABLE discoveries ADD COLUMN IF NOT EXISTS viewed_at timestamptz;
    CREATE INDEX IF NOT EXISTS discoveries_diamond_idx ON discoveries (is_diamond);
    CREATE INDEX IF NOT EXISTS discoveries_viewed_idx ON discoveries (viewed_at);
  `);

  // 2) A legacy production table can carry extra NOT NULL columns (from an
  //    older schema) that the current INSERT never fills. Every insert then
  //    fails with "null value in column ... violates not-null constraint",
  //    so available domains are found but NEVER saved (discoveries stays 0).
  //    Relax NOT NULL on any required column the current code does not write,
  //    so inserts succeed. Purely a constraint relaxation — no data is lost.
  await pool.query(`
    DO $$
    DECLARE col record;
    BEGIN
      FOR col IN
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'discoveries'
          AND is_nullable = 'NO'
          AND column_default IS NULL
          AND column_name NOT IN (
            'id','fqdn','name','tld','category','strategy','pattern','length',
            'value_score','memorability','radio_test','rationale','dns_evidence',
            'is_diamond','discovered_at'
          )
      LOOP
        EXECUTE format('ALTER TABLE discoveries ALTER COLUMN %I DROP NOT NULL', col.column_name);
        RAISE NOTICE 'ensureSchema: dropped NOT NULL on legacy column %', col.column_name;
      END LOOP;
    END $$;
  `);

  // 3) Log the actual column layout so production schema drift is visible in
  //    the boot logs (helps diagnose any remaining insert failures).
  try {
    const res = await pool.query(
      `SELECT column_name, is_nullable, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'discoveries'
       ORDER BY ordinal_position`,
    );
    const cols = res.rows
      .map((r) => `${r.column_name}${r.is_nullable === "NO" ? "*" : ""}`)
      .join(", ");
    console.log(`[db] discoveries columns (*=NOT NULL): ${cols}`);
  } catch (err) {
    console.error("[db] could not introspect discoveries columns:", err);
  }
}

export * from "./schema";
