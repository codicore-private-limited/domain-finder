/**
 * Centralised configuration — every tunable threshold in one place.
 *
 * All values can be overridden via environment variables so the owner can
 * tune selectivity without touching source code.  See ANALYSIS.md for a full
 * reference table and .env.example for the defaults.
 */

function readInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

// ── Diamond gate ────────────────────────────────────────────────────────────

/**
 * Minimum score (0-100) for a name to be classified as `isDiamond = true`.
 * Raising this makes the gate stricter (fewer diamonds, higher quality).
 * Lowering it surfaces more candidates at the cost of precision.
 * Env: DIAMOND_THRESHOLD (legacy: AI_DIAMOND_THRESHOLD)
 */
export const DIAMOND_THRESHOLD: number = (() => {
  const raw = process.env.DIAMOND_THRESHOLD ?? process.env.AI_DIAMOND_THRESHOLD;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(60, Math.min(100, Math.round(value))) : 88;
})();

// ── Scoring caps ────────────────────────────────────────────────────────────

/**
 * Maximum `valueScore` allowed for a two-word combo that contains one of the
 * WEAK_GENERIC_NOUNS (tab, tile, ratio, rack …) and is NOT a recognised
 * high-value commercial category phrase.
 * Env: WEAK_NOUN_MAX_SCORE
 */
export const WEAK_NOUN_MAX_SCORE: number = readInt("WEAK_NOUN_MAX_SCORE", 65, 20, 90);

/**
 * Maximum `valueScore` for a single-segment weak noun (not a two-word combo).
 * Env: WEAK_NOUN_SINGLE_MAX_SCORE
 */
export const WEAK_NOUN_SINGLE_MAX_SCORE: number = readInt("WEAK_NOUN_SINGLE_MAX_SCORE", 75, 20, 90);

/**
 * Minimum corpus demand (0-100) for a `REAL_PHRASES` entry to be treated as
 * a high-value category phrase eligible for diamond grade.
 * Env: MIN_PHRASE_DEMAND
 */
export const MIN_PHRASE_DEMAND: number = readInt("MIN_PHRASE_DEMAND", 0, 0, 100);

/**
 * Demand threshold above which a known real phrase qualifies as a
 * high-value commercial category (and may reach diamond grade even if it
 * contains a weak filler noun in one segment).
 * Env: HIGH_VALUE_PHRASE_DEMAND_THRESHOLD
 */
export const HIGH_VALUE_PHRASE_DEMAND_THRESHOLD: number = readInt(
  "HIGH_VALUE_PHRASE_DEMAND_THRESHOLD",
  85,
  50,
  100,
);

// ── Hunter loop ─────────────────────────────────────────────────────────────

/**
 * Number of names probed (DNS + RDAP) per hunter cycle.
 * Env: HUNTER_BATCH_SIZE
 */
export const HUNTER_BATCH_SIZE: number = readInt("HUNTER_BATCH_SIZE", 5000, 50, 10000);

/**
 * Maximum simultaneous DNS connections.
 * Env: HUNTER_CONCURRENCY
 */
export const HUNTER_CONCURRENCY: number = readInt("HUNTER_CONCURRENCY", 800, 10, 1200);

/**
 * How long (ms) before a previously-checked name is eligible for a re-probe.
 * Default 10 minutes — frequent enough to catch expirations without hammering
 * the DNS resolvers.
 * Env: HUNTER_RECHECK_MS
 */
export const HUNTER_RECHECK_MS: number = readInt(
  "HUNTER_RECHECK_MS",
  10 * 60 * 1000,
  60 * 1000,
  6 * 60 * 60 * 1000,
);

// ── Diversity / flooding prevention ─────────────────────────────────────────

/**
 * Maximum number of entries sharing the same first-word stem that may appear
 * in the Verb+Noun / Noun+Noun combinatorial pool.  Prevents hundreds of
 * `lane*`, `mode*`, `vote*` variants from flooding the hunt pool.
 *
 * Example: with a cap of 25, "setuser setdata setpay … setzone" are kept but
 * the remaining ~75 "set*" combos are dropped until the earlier ones expire.
 *
 * Env: DIVERSITY_PREFIX_CAP
 */
export const DIVERSITY_PREFIX_CAP: number = readInt("DIVERSITY_PREFIX_CAP", 25, 1, 500);

/**
 * Maximum number of entries sharing the same second-word stem (suffix) in the
 * Verb+Noun / Noun+Noun combinatorial pool.
 * Env: DIVERSITY_SUFFIX_CAP
 */
export const DIVERSITY_SUFFIX_CAP: number = readInt("DIVERSITY_SUFFIX_CAP", 25, 1, 500);
