import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * Normalized news / market events ingested from external sources.
 * One canonical row per deduped event (multiple raw items may collapse here).
 */
export const newsEventsTable = pgTable(
  "news_events",
  {
    id: serial("id").primaryKey(),
    // Stable hash of source+url+title to dedupe across polls.
    dedupeKey: text("dedupe_key").notNull(),
    source: text("source").notNull(), // e.g. "hackernews", "reddit", "rss:techcrunch"
    sourceId: text("source_id").notNull(), // upstream id / url
    title: text("title").notNull(),
    summary: text("summary"),
    url: text("url"),
    // Free-form list of category tags ("ai","quantum","biotech"...).
    categories: jsonb("categories").notNull().$type<string[]>(),
    // Extracted lowercase keywords (no spaces, 3-12 chars).
    keywords: jsonb("keywords").notNull().$type<string[]>(),
    // Impact score 0..100 used to weight downstream hunts.
    impactScore: numeric("impact_score", { precision: 5, scale: 2 }).notNull(),
    // Raw upstream metadata (points, comments, author, etc.) — for explainability.
    metadata: jsonb("metadata"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    dedupeIdx: uniqueIndex("news_events_dedupe_unique").on(t.dedupeKey),
    impactIdx: index("news_events_impact_idx").on(t.impactScore),
    publishedIdx: index("news_events_published_idx").on(t.publishedAt),
  }),
);

export type NewsEventRow = typeof newsEventsTable.$inferSelect;

/**
 * Time-windowed keyword momentum. Rolling aggregate computed by ingestion loop.
 * Used by Hunter to bias generation toward currently-hot terms.
 */
export const trendSignalsTable = pgTable(
  "trend_signals",
  {
    keyword: text("keyword").primaryKey(),
    category: text("category").notNull(), // best-fit category for this keyword
    // Mention count in last 24h / 7d windows.
    count24h: integer("count_24h").notNull().default(0),
    count7d: integer("count_7d").notNull().default(0),
    // Rolling weight 0..100 (recency + frequency + source trust).
    weight: numeric("weight", { precision: 5, scale: 2 }).notNull().default("0"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    weightIdx: index("trend_signals_weight_idx").on(t.weight),
    categoryIdx: index("trend_signals_category_idx").on(t.category),
  }),
);

export type TrendSignalRow = typeof trendSignalsTable.$inferSelect;

/**
 * Audit trail of legal / trademark gate decisions for every candidate
 * that reached the persistence step (allowed or rejected).
 */
export const legalDecisionsTable = pgTable(
  "legal_decisions",
  {
    id: serial("id").primaryKey(),
    fqdn: text("fqdn").notNull(),
    verdict: text("verdict").notNull(), // "allow" | "block" | "review"
    risk: text("risk").notNull(), // "low" | "medium" | "high"
    matches: jsonb("matches").notNull().$type<string[]>(),
    rationale: text("rationale").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    fqdnIdx: index("legal_decisions_fqdn_idx").on(t.fqdn),
    verdictIdx: index("legal_decisions_verdict_idx").on(t.verdict),
  }),
);

export type LegalDecisionRow = typeof legalDecisionsTable.$inferSelect;

/**
 * High-value generic keyword "seeds" extracted from funding / research / FDA
 * events by the LLM. These bias the Hunter toward freshly-emerging commercial
 * trends BEFORE they hit the mainstream — the core edge of the engine.
 *
 * We deliberately store only GENERIC product/tech terms (company/brand names are
 * rejected upstream) to stay clear of trademark / UDRP risk.
 */
export const domainSeedsTable = pgTable(
  "domain_seeds",
  {
    id: serial("id").primaryKey(),
    // Lowercase generic keyword or short two-word phrase (no brand names).
    keyword: text("keyword").notNull(),
    category: text("category").notNull(),
    // Where it came from (news_event url) for explainability.
    sourceUrl: text("source_url"),
    sourceTitle: text("source_title"),
    // Detected funding amount in USD (0 if unknown / not a funding event).
    fundingUsd: numeric("funding_usd", { precision: 16, scale: 2 })
      .notNull()
      .default("0"),
    // "funding" | "research" | "pharma" | "trend"
    origin: text("origin").notNull().default("trend"),
    // 0..100 priority weight (funding size + source trust).
    weight: numeric("weight", { precision: 5, scale: 2 }).notNull().default("0"),
    // Set once the Hunter has consumed this seed into a generation cycle.
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    keywordIdx: uniqueIndex("domain_seeds_keyword_unique").on(t.keyword),
    categoryIdx: index("domain_seeds_category_idx").on(t.category),
    weightIdx: index("domain_seeds_weight_idx").on(t.weight),
  }),
);

export type DomainSeedRow = typeof domainSeedsTable.$inferSelect;

/**
 * Watch-list of HIGH-VALUE .com domains that are currently TAKEN but heading
 * toward release (expiration soon, redemption / pending-delete status). These
 * are the realistic source of crore-grade names: catching a good domain the
 * moment it drops. We alert the user BEFORE the drop date so they can backorder.
 */
export const expiringWatchTable = pgTable(
  "expiring_watch",
  {
    id: serial("id").primaryKey(),
    fqdn: text("fqdn").notNull(),
    // The bare name (no .com) — matches our hunt pool entries.
    name: text("name").notNull(),
    // RDAP expiration date, if known.
    expirationDate: timestamp("expiration_date", { withTimezone: true }),
    // Latest RDAP status tags (e.g. "redemptionPeriod","pendingDelete").
    status: jsonb("status").notNull().$type<string[]>(),
    // "expiring" (date soon) | "redemption" | "pendingDelete" | "dropping"
    phase: text("phase").notNull(),
    // Why we think it's valuable (matched curated phrase / short word / seed).
    valueReason: text("value_reason"),
    // Realistic resale band label (plain words, not a numeric score).
    valueBand: text("value_band"),
    alertedAt: timestamp("alerted_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    fqdnIdx: uniqueIndex("expiring_watch_fqdn_unique").on(t.fqdn),
    phaseIdx: index("expiring_watch_phase_idx").on(t.phase),
    expIdx: index("expiring_watch_exp_idx").on(t.expirationDate),
  }),
);

export type ExpiringWatchRow = typeof expiringWatchTable.$inferSelect;