import { EventEmitter } from "events";
import { sql, desc, gte, eq } from "drizzle-orm";
import {
  db,
  newsEventsTable,
  trendSignalsTable,
  type NewsEventRow,
  type TrendSignalRow,
} from "@workspace/db";
import { logger } from "../logger";
import { fetchAllSources } from "./sources";
import { normalizeBatch, type NormalizedEvent } from "./normalizer";

export interface NewsIngestEvent {
  ts: string;
  ingested: number;
  duplicates: number;
  topImpact: { title: string; impact: number; categories: string[] }[];
}

class NewsIngest extends EventEmitter {
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private intervalMs: number;
  private state = {
    lastRunAt: null as string | null,
    lastIngested: 0,
    totalIngested: 0,
    totalDuplicates: 0,
    runs: 0,
  };

  constructor(intervalMs = 5 * 60 * 1000) {
    super();
    this.intervalMs = intervalMs;
  }

  getState() {
    return { ...this.state, running: this.running };
  }

  private safeRunOnce() {
    this.runOnce().catch((err) => {
      logger.error({ err }, "News ingest runOnce failed");
    });
  }

  start() {
    if (this.running) return;
    this.running = true;
    // Initial run immediately, then on interval. Errors must never escape
    // (would become unhandled rejections and crash the process on Node 24).
    this.safeRunOnce();
    this.timer = setInterval(() => this.safeRunOnce(), this.intervalMs);
    logger.info({ intervalMs: this.intervalMs }, "News ingest started");
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(): Promise<NewsIngestEvent> {
    const started = Date.now();
    const raw = await fetchAllSources();
    const normalized = normalizeBatch(raw);
    const result = await this.persistEvents(normalized);
    await this.recomputeTrendSignals();

    this.state.lastRunAt = new Date().toISOString();
    this.state.lastIngested = result.inserted;
    this.state.totalIngested += result.inserted;
    this.state.totalDuplicates += result.duplicates;
    this.state.runs++;

    const top = normalized
      .slice()
      .sort((a, b) => b.impactScore - a.impactScore)
      .slice(0, 5)
      .map((e) => ({ title: e.title, impact: e.impactScore, categories: e.categories }));

    const ev: NewsIngestEvent = {
      ts: this.state.lastRunAt,
      ingested: result.inserted,
      duplicates: result.duplicates,
      topImpact: top,
    };
    this.emit("ingest", ev);
    logger.info(
      { ingested: result.inserted, duplicates: result.duplicates, ms: Date.now() - started },
      "News ingest cycle complete",
    );
    return ev;
  }

  private async persistEvents(events: NormalizedEvent[]): Promise<{ inserted: number; duplicates: number }> {
    if (events.length === 0) return { inserted: 0, duplicates: 0 };
    let inserted = 0;
    // Bulk insert with ON CONFLICT DO NOTHING on dedupe_key.
    const rows = events.map((e) => ({
      dedupeKey: e.dedupeKey,
      source: e.source,
      sourceId: e.sourceId,
      title: e.title,
      summary: e.summary,
      url: e.url,
      categories: e.categories,
      keywords: e.keywords,
      impactScore: String(e.impactScore),
      metadata: e.metadata,
      publishedAt: e.publishedAt,
    }));
    try {
      const result = await db
        .insert(newsEventsTable)
        .values(rows)
        .onConflictDoNothing({ target: newsEventsTable.dedupeKey })
        .returning({ id: newsEventsTable.id });
      inserted = result.length;
    } catch (err) {
      logger.error({ err }, "Failed to persist news events");
    }
    return { inserted, duplicates: events.length - inserted };
  }

  /**
   * Recompute trend_signals from events in last 7 days.
   * Aggregates keyword frequency weighted by event impact.
   */
  private async recomputeTrendSignals(): Promise<void> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
      const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000);
      const recent = await db
        .select({
          keywords: newsEventsTable.keywords,
          categories: newsEventsTable.categories,
          impactScore: newsEventsTable.impactScore,
          publishedAt: newsEventsTable.publishedAt,
        })
        .from(newsEventsTable)
        .where(gte(newsEventsTable.publishedAt, sevenDaysAgo));

      // Aggregate: keyword -> { count24h, count7d, weight, category votes }
      const agg = new Map<
        string,
        { count24h: number; count7d: number; weight: number; categoryVotes: Map<string, number>; lastSeen: Date }
      >();
      for (const r of recent) {
        const impact = Number(r.impactScore);
        const isRecent = r.publishedAt >= oneDayAgo;
        for (const kw of r.keywords) {
          const cur = agg.get(kw) ?? {
            count24h: 0,
            count7d: 0,
            weight: 0,
            categoryVotes: new Map<string, number>(),
            lastSeen: r.publishedAt,
          };
          cur.count7d++;
          if (isRecent) cur.count24h++;
          cur.weight += impact;
          if (r.publishedAt > cur.lastSeen) cur.lastSeen = r.publishedAt;
          for (const cat of r.categories) {
            cur.categoryVotes.set(cat, (cur.categoryVotes.get(cat) ?? 0) + 1);
          }
          agg.set(kw, cur);
        }
      }

      if (agg.size === 0) return;

      // Normalize weight to 0..100 by dividing by max.
      let maxWeight = 0;
      for (const v of agg.values()) if (v.weight > maxWeight) maxWeight = v.weight;
      const denom = maxWeight > 0 ? maxWeight : 1;

      const rows = Array.from(agg.entries()).map(([keyword, v]) => {
        // Pick best-fit category (most votes).
        let bestCat = "ai";
        let bestVotes = 0;
        for (const [cat, votes] of v.categoryVotes.entries()) {
          if (votes > bestVotes) {
            bestVotes = votes;
            bestCat = cat;
          }
        }
        const normWeight = Math.round((v.weight / denom) * 100 * 10) / 10;
        return {
          keyword,
          category: bestCat,
          count24h: v.count24h,
          count7d: v.count7d,
          weight: String(normWeight),
          lastSeenAt: v.lastSeen,
          updatedAt: new Date(),
        };
      });

      // Upsert in chunks.
      const CHUNK = 200;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        await db
          .insert(trendSignalsTable)
          .values(slice)
          .onConflictDoUpdate({
            target: trendSignalsTable.keyword,
            set: {
              category: sql`excluded.category`,
              count24h: sql`excluded.count_24h`,
              count7d: sql`excluded.count_7d`,
              weight: sql`excluded.weight`,
              lastSeenAt: sql`excluded.last_seen_at`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
      }
    } catch (err) {
      logger.error({ err }, "Failed to recompute trend signals");
    }
  }
}

export const newsIngest = new NewsIngest(5 * 60 * 1000);

/**
 * Public read API used by Hunter to fetch top trending keywords for a category.
 * Returns up to `limit` keywords sorted by weight desc.
 */
export async function getTrendKeywordsForCategory(
  category: string,
  limit = 12,
): Promise<{ keyword: string; weight: number }[]> {
  try {
    const rows = await db
      .select({
        keyword: trendSignalsTable.keyword,
        weight: trendSignalsTable.weight,
      })
      .from(trendSignalsTable)
      .where(eq(trendSignalsTable.category, category))
      .orderBy(desc(trendSignalsTable.weight))
      .limit(limit);
    return rows.map((r) => ({ keyword: r.keyword, weight: Number(r.weight) }));
  } catch (err) {
    logger.debug({ err }, "Trend signals query failed");
    return [];
  }
}

export async function getRecentEvents(limit = 20): Promise<NewsEventRow[]> {
  try {
    return await db
      .select()
      .from(newsEventsTable)
      .orderBy(desc(newsEventsTable.ingestedAt))
      .limit(limit);
  } catch {
    return [];
  }
}

export async function getTopTrendSignals(limit = 30): Promise<TrendSignalRow[]> {
  try {
    return await db
      .select()
      .from(trendSignalsTable)
      .orderBy(desc(trendSignalsTable.weight))
      .limit(limit);
  } catch {
    return [];
  }
}
