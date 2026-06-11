import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const discoveriesTable = pgTable(
  "discoveries",
  {
    id: serial("id").primaryKey(),
    fqdn: text("fqdn").notNull(),
    name: text("name").notNull(),
    tld: text("tld").notNull(),
    category: text("category").notNull(),
    strategy: text("strategy").notNull(),
    pattern: text("pattern").notNull(),
    length: integer("length").notNull(),
    valueScore: numeric("value_score", { precision: 5, scale: 2 }).notNull(),
    memorability: integer("memorability").notNull(),
    radioTest: integer("radio_test").notNull(),
    rationale: text("rationale").notNull(),
    dnsEvidence: text("dns_evidence").notNull(),
    // LLM quality evaluation (50-factor AI check).
    isDiamond: boolean("is_diamond").notNull().default(false),
    diamondScore: numeric("diamond_score", { precision: 5, scale: 2 }),
    diamondReason: text("diamond_reason"),
    // User review tracking — set when the user marks this domain as "seen".
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    discoveredAt: timestamp("discovered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    fqdnIdx: uniqueIndex("discoveries_fqdn_unique").on(t.fqdn),
    scoreIdx: index("discoveries_score_idx").on(t.valueScore),
    discoveredIdx: index("discoveries_discovered_idx").on(t.discoveredAt),
    diamondIdx: index("discoveries_diamond_idx").on(t.isDiamond),
    viewedIdx: index("discoveries_viewed_idx").on(t.viewedAt),
  }),
);

export type DiscoveryRow = typeof discoveriesTable.$inferSelect;

export const dnsCacheTable = pgTable(
  "dns_cache",
  {
    fqdn: text("fqdn").primaryKey(),
    signal: text("signal").notNull(),
    evidence: text("evidence").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type DnsCacheRow = typeof dnsCacheTable.$inferSelect;
