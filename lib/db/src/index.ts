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
export const db = drizzle(pool, { schema });

export * from "./schema";
