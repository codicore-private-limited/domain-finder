import { EventEmitter } from "events";
import { sql, inArray, eq } from "drizzle-orm";
import { db, discoveriesTable, dnsCacheTable } from "@workspace/db";
import { ALL_STRATEGIES } from "./generators";
import { scoreCandidate } from "./scoring";
import { generateTrendsForCategory, buildRationale } from "./groq";
import { dnsAvailabilityBatch, type DnsCheckResult } from "./availability";
import { rdapBatch } from "./rdap";
import { logger } from "./logger";
import { queueTelegramAlert, sendStartupAlert } from "./telegram";
import { getTrendKeywordsForCategory } from "./news/ingest";
import { getSeedKeywordsForCategory } from "./news/extractor";
import { filterLegallyAllowed } from "./legal/gate";
import { isSellableDomain, HUNT_POOL } from "./wordlists";

const TELEGRAM_ALERT_THRESHOLD = 96;

// Re-check every name's .com on this interval so we catch the rare ones that
// EXPIRE and become available again. Expiry is the only realistic way a good
// name frees up — so we keep sweeping the whole hunt pool (good one-word
// dictionary words + meaningful phrases) and re-probe each name once its last
// check ages past this window.
const PHRASE_RECHECK_MS = 6 * 60 * 60 * 1000; // 6 hours

const CATEGORIES = [
  "ai",
  "quantum",
  "biotech",
  "green_energy",
  "space_tech",
] as const;

const STRATEGIES = ALL_STRATEGIES;

type Category = (typeof CATEGORIES)[number];
type Strategy = (typeof STRATEGIES)[number];

export interface HunterEvent {
  id: number;
  ts: string;
  kind:
    | "phase"
    | "generated"
    | "scored"
    | "checking"
    | "registered"
    | "discovery"
    | "skipped"
    | "info"
    | "error";
  message: string;
  data?: Record<string, unknown>;
}

export interface PerBucketStats {
  generated: number;
  checked: number;
  diamonds: number;
}

export interface HunterState {
  running: boolean;
  startedAt: string | null;
  cycle: number;
  totalGenerated: number;
  totalEvaluated: number;
  totalScoreFiltered: number;
  totalChecked: number;
  totalRegistered: number;
  totalDiscoveries: number;
  totalUnknown: number;
  totalDuplicateSkips: number;
  totalRdapVerified: number;
  totalRdapFalsePositives: number;
  totalRdapUnknown: number;
  cleanupRunning: boolean;
  cleanupChecked: number;
  cleanupRemoved: number;
  currentCategory: Category | null;
  currentStrategy: Strategy | null;
  minValueScore: number;
  effectiveMinScore: number;
  starvationStreak: number;
  perStrategy: Record<string, PerBucketStats>;
  perCategory: Record<string, PerBucketStats>;
  everSearchedSize: number;
  checksPerSecond: number;
  evaluatedPerSecond: number;
  batchSize: number;
  concurrency: number;
}

const RING_SIZE = 250;
const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_CONCURRENCY = 200;
const DEFAULT_MIN_SCORE = 0;

class Hunter extends EventEmitter {
  private state: HunterState = {
    running: false,
    startedAt: null,
    cycle: 0,
    totalGenerated: 0,
    totalEvaluated: 0,
    totalScoreFiltered: 0,
    totalChecked: 0,
    totalRegistered: 0,
    totalDiscoveries: 0,
    totalUnknown: 0,
    totalDuplicateSkips: 0,
    totalRdapVerified: 0,
    totalRdapFalsePositives: 0,
    totalRdapUnknown: 0,
    cleanupRunning: false,
    cleanupChecked: 0,
    cleanupRemoved: 0,
    currentCategory: null,
    currentStrategy: null,
    minValueScore: DEFAULT_MIN_SCORE,
    effectiveMinScore: DEFAULT_MIN_SCORE,
    starvationStreak: 0,
    perStrategy: {},
    perCategory: {},
    everSearchedSize: 0,
    checksPerSecond: 0,
    evaluatedPerSecond: 0,
    batchSize: DEFAULT_BATCH_SIZE,
    concurrency: DEFAULT_CONCURRENCY,
  };
  private stopRequested = false;
  private trendCache = new Map<
    Category,
    { keywords: string[]; expiresAt: number }
  >();
  private trendLastLoggedAt = new Map<Category, number>();
  private nextEventId = 1;
  private ring: HunterEvent[] = [];

  // PERMANENT search history — every fqdn ever DNS-checked.
  // Loaded from dns_cache on startup, kept in sync as we run.
  private everSearched = new Set<string>();
  // Mirror set of just the bare label (no TLD) used as the generator's
  // exclude-set. Maintained in lock-step with `everSearched` so we don't have
  // to rebuild a fresh Set every cycle (that was a multi-MB-per-cycle
  // allocation that pushed the heap past 256 MB on Render).
  private everSearchedBare = new Set<string>();
  private historyLoaded = false;

  // Re-check bookkeeping: bare phrase → last DNS-check time (ms). Drives the
  // periodic re-probe of meaningful phrases so expiring .coms get caught.
  private phraseLastCheck = new Map<string, number>();

  private trackSearched(fqdn: string) {
    if (this.everSearched.has(fqdn)) return;
    this.everSearched.add(fqdn);
    const dot = fqdn.indexOf(".");
    this.everSearchedBare.add(dot > 0 ? fqdn.slice(0, dot) : fqdn);
  }

  // Throughput tracking — checks per second over a 5s sliding window.
  private throughputWindow: { ts: number; checks: number }[] = [];
  private evalWindow: { ts: number; evaluated: number }[] = [];

  private bumpStat(
    bucket: "perStrategy" | "perCategory",
    key: string,
    field: keyof PerBucketStats,
    by = 1,
  ) {
    const map = this.state[bucket];
    const cur = map[key] ?? { generated: 0, checked: 0, diamonds: 0 };
    cur[field] += by;
    map[key] = cur;
  }

  async loadHistory() {
    if (this.historyLoaded) return;
    try {
      const rows = await db
        .select({ fqdn: dnsCacheTable.fqdn, checkedAt: dnsCacheTable.checkedAt })
        .from(dnsCacheTable);
      const phraseSet = new Set(HUNT_POOL);
      for (const r of rows) {
        this.trackSearched(r.fqdn);
        // Record last-check time for hunt-pool names so the recheck sweep
        // knows when each name is due for another availability probe.
        const dot = r.fqdn.indexOf(".");
        const bare = dot > 0 ? r.fqdn.slice(0, dot) : r.fqdn;
        if (phraseSet.has(bare) && r.checkedAt) {
          this.phraseLastCheck.set(bare, new Date(r.checkedAt).getTime());
        }
      }
      this.state.everSearchedSize = this.everSearched.size;
      this.historyLoaded = true;
      logger.info(
        { historySize: this.everSearched.size, phrasesTracked: this.phraseLastCheck.size },
        "Hunter history loaded into memory",
      );
    } catch (err) {
      logger.error({ err }, "Failed to load DNS history");
    }
  }

  /**
   * Build the next batch of names to probe. Walks the full hunt pool (good
   * one-word dictionary words + meaningful phrases, highest-value first) and
   * selects every name whose .com has NOT been checked within the recheck
   * window. This is how the hunter keeps catching the rare name that expires
   * and frees up — it never gives up on the good names.
   */
  private buildPhraseBatch(limit: number): string[] {
    const now = Date.now();
    const out: string[] = [];
    for (let i = 0; i < HUNT_POOL.length && out.length < limit; i++) {
      const name = HUNT_POOL[i]!;
      const last = this.phraseLastCheck.get(name) ?? 0;
      if (now - last < PHRASE_RECHECK_MS) continue;
      out.push(name);
    }
    return out;
  }

  private emitEvent(ev: Omit<HunterEvent, "id" | "ts">) {
    const full: HunterEvent = {
      id: this.nextEventId++,
      ts: new Date().toISOString(),
      ...ev,
    };
    this.ring.push(full);
    if (this.ring.length > RING_SIZE) this.ring.shift();
    this.emit("event", full);
  }

  getRecentEvents(sinceId = 0): HunterEvent[] {
    return this.ring.filter((e) => e.id > sinceId);
  }

  getState(): HunterState {
    this.recomputeThroughput();
    return { ...this.state };
  }

  getInsights() {
    const strategies = Object.entries(this.state.perStrategy)
      .map(([key, v]) => ({
        key,
        ...v,
        diamondYield: v.checked > 0 ? Math.round((v.diamonds / v.checked) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.diamonds - a.diamonds);
    const categories = Object.entries(this.state.perCategory)
      .map(([key, v]) => ({
        key,
        ...v,
        diamondYield: v.checked > 0 ? Math.round((v.diamonds / v.checked) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.diamonds - a.diamonds);
    return {
      perStrategy: strategies,
      perCategory: categories,
      everSearchedSize: this.everSearched.size,
      effectiveMinScore: this.state.effectiveMinScore,
      requestedMinScore: this.state.minValueScore,
      starvationStreak: this.state.starvationStreak,
      checksPerSecond: this.state.checksPerSecond,
      batchSize: this.state.batchSize,
      concurrency: this.state.concurrency,
    };
  }

  setMinScore(score: number) {
    const clamped = Math.max(0, Math.min(100, score));
    this.state.minValueScore = clamped;
    this.state.effectiveMinScore = clamped;
    this.state.starvationStreak = 0;
  }

  setSpeed(opts: { batchSize?: number; concurrency?: number }) {
    if (typeof opts.batchSize === "number") {
      this.state.batchSize = Math.max(50, Math.min(2000, opts.batchSize));
    }
    if (typeof opts.concurrency === "number") {
      this.state.concurrency = Math.max(10, Math.min(400, opts.concurrency));
    }
  }

  async start(opts?: { minValueScore?: number; batchSize?: number; concurrency?: number }) {
    if (this.state.running) return;
    await this.loadHistory();
    if (typeof opts?.minValueScore === "number") this.setMinScore(opts.minValueScore);
    if (opts?.batchSize || opts?.concurrency) this.setSpeed(opts);
    this.state.running = true;
    this.state.startedAt = new Date().toISOString();
    this.stopRequested = false;
    this.emitEvent({
      kind: "info",
      message: `Hunter armed — ${this.everSearched.size.toLocaleString()} names already in history. batch=${this.state.batchSize} concurrency=${this.state.concurrency} min=${this.state.minValueScore}`,
    });
    // Fire startup Telegram notification (non-blocking).
    void db
      .select({ c: sql<number>`count(*)::int` })
      .from(discoveriesTable)
      .then((r) => sendStartupAlert(r[0]?.c ?? 0))
      .catch(() => {});
    void this.loop();
  }

  stop() {
    if (!this.state.running) return;
    this.stopRequested = true;
    this.emitEvent({ kind: "info", message: "Hunter stop requested" });
  }

  reset() {
    // Note: this does NOT clear everSearched (permanent history). Only resets stats counters.
    this.state.totalGenerated = 0;
    this.state.totalEvaluated = 0;
    this.state.totalScoreFiltered = 0;
    this.state.totalChecked = 0;
    this.state.totalRegistered = 0;
    this.state.totalDiscoveries = 0;
    this.state.totalUnknown = 0;
    this.state.totalDuplicateSkips = 0;
    this.state.perStrategy = {};
    this.state.perCategory = {};
    this.trendLastLoggedAt.clear();
    this.emitEvent({
      kind: "info",
      message: `Stats reset. Permanent history kept (${this.everSearched.size.toLocaleString()} names will never be re-checked).`,
    });
  }

  private async getTrends(category: Category): Promise<string[]> {
    const cached = this.trendCache.get(category);
    if (cached && cached.expiresAt > Date.now()) return cached.keywords;

    // Priority 0: fresh LLM-extracted seeds from funding/FDA/research events.
    // These are the strongest, most time-sensitive commercial signals.
    const seedSignals = await getSeedKeywordsForCategory(category, 8).catch(() => []);
    const seedKeywords = seedSignals.map((s) => s.keyword);

    // Priority 1: live news-derived trend signals (event-driven).
    const newsSignals = await getTrendKeywordsForCategory(category, 10).catch(() => []);
    const newsKeywords = newsSignals.map((s) => s.keyword);

    // Priority 2: Groq/static curated bundle (always present).
    const bundle = await generateTrendsForCategory(category);
    const baseKeywords = bundle.keywords.map((k) => k.keyword);

    // Merge: seeds first, then news signals, then base keywords (deduped).
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const k of [...seedKeywords, ...newsKeywords, ...baseKeywords]) {
      if (k && !seen.has(k)) {
        seen.add(k);
        merged.push(k);
      }
    }

    if (seedKeywords.length > 0) {
      this.emitEvent({
        kind: "info",
        message: `[${category}] funding/research seeds injected: ${seedKeywords.slice(0, 5).join(", ")}`,
        data: { category, seedKeywords, source: "domain_seeds" },
      });
    }

    if (newsKeywords.length > 0) {
      this.emitEvent({
        kind: "info",
        message: `[${category}] news-driven keywords injected: ${newsKeywords.slice(0, 5).join(", ")}`,
        data: { category, newsKeywords, source: "news_signals" },
      });
    }

    this.trendCache.set(category, {
      keywords: merged,
      expiresAt: Date.now() + 30 * 60 * 1000,
    });
    return merged;
  }

  private recordThroughput(checks: number) {
    const now = Date.now();
    this.throughputWindow.push({ ts: now, checks });
    const cutoff = now - 5000;
    while (this.throughputWindow.length > 0 && this.throughputWindow[0]!.ts < cutoff) {
      this.throughputWindow.shift();
    }
  }

  private recordEvaluated(evaluated: number) {
    const now = Date.now();
    this.evalWindow.push({ ts: now, evaluated });
    const cutoff = now - 5000;
    while (this.evalWindow.length > 0 && this.evalWindow[0]!.ts < cutoff) {
      this.evalWindow.shift();
    }
  }

  private recomputeThroughput() {
    const now = Date.now();
    // DNS throughput uses a tight 10s window (it's continuous between cycles).
    const dnsCutoff = now - 10_000;
    while (this.throughputWindow.length > 0 && this.throughputWindow[0]!.ts < dnsCutoff) {
      this.throughputWindow.shift();
    }
    const total = this.throughputWindow.reduce((s, w) => s + w.checks, 0);
    const span = Math.max(1, (now - (this.throughputWindow[0]?.ts ?? now)) / 1000);
    this.state.checksPerSecond = Math.round(total / span);

    // Eval is bursty (in-memory generation happens at start of each cycle, then
    // we wait on DNS). Use a wider 30s window so the published number reflects
    // sustained throughput across cycles.
    const evalCutoff = now - 30_000;
    while (this.evalWindow.length > 0 && this.evalWindow[0]!.ts < evalCutoff) {
      this.evalWindow.shift();
    }
    const evalTotal = this.evalWindow.reduce((s, w) => s + w.evaluated, 0);
    const evalSpan = Math.max(1, (now - (this.evalWindow[0]?.ts ?? now)) / 1000);
    this.state.evaluatedPerSecond = Math.round(evalTotal / evalSpan);
  }

  private async bulkCacheUpsert(results: DnsCheckResult[]) {
    if (results.length === 0) return;
    // Dedupe by fqdn — Postgres ON CONFLICT DO UPDATE cannot affect the same row
    // twice in one statement, so a batch with a repeated fqdn would throw and
    // lose the whole batch (including newly-found available names). Keep the
    // last occurrence for each fqdn.
    const byFqdn = new Map<string, DnsCheckResult>();
    for (const r of results) byFqdn.set(r.fqdn, r);
    const deduped = Array.from(byFqdn.values());
    // Chunk to keep parameter count safe (1000 params per chunk).
    const CHUNK = 250;
    for (let i = 0; i < deduped.length; i += CHUNK) {
      const slice = deduped.slice(i, i + CHUNK);
      await db
        .insert(dnsCacheTable)
        .values(
          slice.map((r) => ({
            fqdn: r.fqdn,
            signal: r.signal,
            evidence: r.evidence,
            checkedAt: new Date(r.checkedAt),
          })),
        )
        .onConflictDoUpdate({
          target: dnsCacheTable.fqdn,
          set: {
            signal: sql`excluded.signal`,
            evidence: sql`excluded.evidence`,
            checkedAt: sql`excluded.checked_at`,
          },
        });
    }
  }

  private async runCycle() {
    this.state.cycle++;
    const categoryIdx = this.state.cycle % CATEGORIES.length;
    const strategyIdx =
      Math.floor(this.state.cycle / CATEGORIES.length) % STRATEGIES.length;
    const category = CATEGORIES[categoryIdx]!;
    const strategy = STRATEGIES[strategyIdx]!;
    this.state.currentCategory = category;
    this.state.currentStrategy = strategy;

    const trends = await this.getTrends(category);

    const lastTrendLog = this.trendLastLoggedAt.get(category) ?? 0;
    if (Date.now() - lastTrendLog > 5 * 60 * 1000) {
      this.trendLastLoggedAt.set(category, Date.now());
      this.emitEvent({
        kind: "info",
        message: `[${category}] trend keywords: ${trends.slice(0, 5).join(", ")}`,
      });
    }

    const requested = this.state.batchSize;

    // ── Build the probe batch from the meaningful-phrase list ──
    // The hunter only ever hunts genuine, sellable phrases (curated modern
    // high-value concepts + demand-ranked corpus). buildPhraseBatch walks them
    // highest-value-first and returns those due for a (re)check. There is NO
    // numeric "rating" gate — every real phrase that is due gets probed; if its
    // .com is free, it is a diamond. Period.
    const tEvalStart = Date.now();
    const batch = this.buildPhraseBatch(requested);
    const evalElapsed = Math.max(1, Date.now() - tEvalStart);
    const evaluated = HUNT_POOL.length;
    this.recordEvaluated(evaluated);
    this.state.totalEvaluated += evaluated;
    this.state.totalGenerated += batch.length;
    this.bumpStat("perStrategy", strategy, "generated", batch.length);
    this.bumpStat("perCategory", category, "generated", batch.length);

    if (batch.length === 0) {
      // Every meaningful phrase was checked within the recheck window — nothing
      // is due yet. Idle quietly until a name ages out (this is the expected
      // "1 gem a day/week" cadence the user asked for).
      this.emitEvent({
        kind: "info",
        message: `All ${HUNT_POOL.length.toLocaleString()} good names recently checked — waiting for the next one to free up`,
      });
      await new Promise((r) => setTimeout(r, 15000));
      return;
    }

    // Score purely for storage + ordering (real-world demand), NOT as a rating
    // gate. Phrases are already demand-ordered, so we keep that order.
    const scored = batch.map((name) => ({
      name,
      score: scoreCandidate({ name, tld: "com", trendKeywords: trends }),
    }));
    const passing = scored;
    const evalRate = Math.round((evaluated / evalElapsed) * 1000);
    this.state.starvationStreak = 0;

    this.emitEvent({
      kind: "phase",
      message: `Cycle #${this.state.cycle}: probing ${passing.length} meaningful phrases (#1: ${passing[0]?.name})`,
      data: {
        cycle: this.state.cycle,
        category,
        strategy,
        probing: passing.length,
        generated: batch.length,
        evaluated,
        evalRate,
        topPassed: passing
          .slice(0, 5)
          .map((s) => ({ name: s.name, score: s.score.valueScore })),
      },
    });

    // Massive parallel DNS lookup.
    const fqdns = passing.map((p) => `${p.name}.com`);
    const t0 = Date.now();
    const results = await dnsAvailabilityBatch(fqdns, this.state.concurrency);
    const elapsed = (Date.now() - t0) / 1000;
    const ratePerSec = elapsed > 0 ? Math.round(fqdns.length / elapsed) : fqdns.length;
    this.recordThroughput(fqdns.length);

    // Update history + recheck timestamps for ALL probed names.
    const nowMs = Date.now();
    for (const r of results) {
      this.trackSearched(r.fqdn);
      const dot = r.fqdn.indexOf(".");
      const bare = dot > 0 ? r.fqdn.slice(0, dot) : r.fqdn;
      this.phraseLastCheck.set(bare, nowMs);
    }
    this.state.everSearchedSize = this.everSearched.size;
    this.state.totalChecked += results.length;
    this.bumpStat("perStrategy", strategy, "checked", results.length);
    this.bumpStat("perCategory", category, "checked", results.length);

    // Bulk persist to dns_cache.
    try {
      await this.bulkCacheUpsert(results);
    } catch (err) {
      logger.error({ err }, "Bulk dns_cache upsert failed");
    }

    let registered = 0;
    let unknown = 0;
    const dnsCandidates: { name: string; fqdn: string; result: DnsCheckResult; score: ReturnType<typeof scoreCandidate> }[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      const p = passing[i]!;
      if (r.signal === "registered") registered++;
      else if (r.signal === "unknown") unknown++;
      else if (r.signal === "available") {
        dnsCandidates.push({ name: p.name, fqdn: r.fqdn, result: r, score: p.score });
      }
    }
    this.state.totalRegistered += registered;
    this.state.totalUnknown += unknown;

    // === RDAP GATE ===
    // DNS can have false positives (parked / pending-delete / no-NS-but-registered).
    // Verisign RDAP is authoritative for .com — confirm every "available" before saving.
    let diamonds: typeof dnsCandidates = [];
    let rdapFalsePos = 0;
    let rdapUnknown = 0;
    if (dnsCandidates.length > 0) {
      const rdapResults = await rdapBatch(
        dnsCandidates.map((d) => d.fqdn),
        8,
        50,
      );
      const rdapPersist: DnsCheckResult[] = [];
      for (let i = 0; i < dnsCandidates.length; i++) {
        const c = dnsCandidates[i]!;
        const v = rdapResults[i]!;
        if (v.verdict === "available") {
          // Truly unregistered. Replace evidence with combined DNS+RDAP proof.
          diamonds.push({
            ...c,
            result: { ...c.result, evidence: `${c.result.evidence} · ${v.evidence}` },
          });
          rdapPersist.push({ fqdn: c.fqdn, signal: "available", evidence: v.evidence, checkedAt: new Date().toISOString() });
        } else if (v.verdict === "registered") {
          rdapFalsePos++;
          // DNS missed it — record proper signal in cache so we never return it again.
          rdapPersist.push({ fqdn: c.fqdn, signal: "registered", evidence: v.evidence, checkedAt: new Date().toISOString() });
        } else {
          // RDAP unknown — be conservative, don't ship as diamond.
          rdapUnknown++;
          rdapPersist.push({ fqdn: c.fqdn, signal: "unknown", evidence: v.evidence, checkedAt: new Date().toISOString() });
        }
      }
      this.state.totalRdapVerified += diamonds.length;
      this.state.totalRdapFalsePositives += rdapFalsePos;
      this.state.totalRdapUnknown += rdapUnknown;
      try {
        await this.bulkCacheUpsert(rdapPersist);
      } catch (err) {
        logger.error({ err }, "Bulk dns_cache RDAP upsert failed");
      }
      if (rdapFalsePos > 0) {
        this.emitEvent({
          kind: "info",
          message: `RDAP rejected ${rdapFalsePos} parked/pending-delete (DNS said free, registry says taken)`,
        });
      }
    }

    // Insert diamonds in bulk.
    if (diamonds.length > 0) {
      // === LEGAL GATE ===
      // Filter out trademark-conflict and review-tier names before persistence.
      const legalResult = await filterLegallyAllowed(
        diamonds.map((d) => ({ ...d, fqdn: d.fqdn, name: d.name })),
      );
      const blockedCount = legalResult.blocked.length + legalResult.reviewed.length;
      if (blockedCount > 0) {
        this.emitEvent({
          kind: "info",
          message: `Legal gate blocked ${blockedCount} candidates (TM risk)`,
          data: {
            blocked: legalResult.blocked.map((d) => d.fqdn),
            reviewed: legalResult.reviewed.map((d) => d.fqdn),
          },
        });
      }
      diamonds = legalResult.allowed;
    }

    if (diamonds.length > 0) {
      const rows = diamonds.map((d) => ({
        fqdn: d.fqdn,
        name: d.name,
        tld: "com",
        category,
        strategy,
        pattern: d.score.pattern,
        length: d.name.length,
        valueScore: String(d.score.valueScore),
        memorability: d.score.memorability,
        radioTest: d.score.radioTest ? 1 : 0,
        rationale: buildRationale({
          name: d.name,
          tld: "com",
          category,
          strategy,
          pattern: d.score.pattern,
          valueScore: d.score.valueScore,
        }),
        dnsEvidence: d.result.evidence,
      }));
      try {
        const inserted = await db
          .insert(discoveriesTable)
          .values(rows)
          .onConflictDoNothing()
          .returning({ fqdn: discoveriesTable.fqdn });
        const insertedSet = new Set(inserted.map((r) => r.fqdn));
        const newCount = insertedSet.size;
        this.state.totalDiscoveries += newCount;
        this.bumpStat("perStrategy", strategy, "diamonds", newCount);
        this.bumpStat("perCategory", category, "diamonds", newCount);

        // Emit individual events for newly-saved diamonds (capped to top 8).
        const newDiamonds = diamonds.filter((d) => insertedSet.has(d.fqdn));
        for (const d of newDiamonds.slice(0, 8)) {
          this.emitEvent({
            kind: "discovery",
            message: `DIAMOND: ${d.fqdn} (score ${d.score.valueScore}, ${category}/${strategy})`,
            data: {
              fqdn: d.fqdn,
              category,
              strategy,
              valueScore: d.score.valueScore,
              pattern: d.score.pattern,
              evidence: d.result.evidence,
              breakdown: d.score.breakdown,
            },
          });
          // 🔔 Telegram alert for elite diamonds only (≥96 score)
          if (d.score.valueScore >= TELEGRAM_ALERT_THRESHOLD) {
            queueTelegramAlert({
              name: d.name,
              fqdn: d.fqdn,
              category,
              strategy,
              valueScore: d.score.valueScore,
              pattern: d.score.pattern,
              rationale: buildRationale({
                name: d.name,
                tld: "com",
                category,
                strategy,
                pattern: d.score.pattern,
                valueScore: d.score.valueScore,
              }),
              dnsEvidence: d.result.evidence,
            });
          }
        }
        if (newDiamonds.length > 8) {
          this.emitEvent({
            kind: "discovery",
            message: `+${newDiamonds.length - 8} more diamonds saved this cycle`,
          });
        }
      } catch (err) {
        logger.error({ err, count: rows.length }, "Bulk discovery insert failed");
      }
    }

    // Per-cycle summary line (one event, not per-name).
    this.emitEvent({
      kind: "generated",
      message: `→ ${results.length} probed @ ${ratePerSec}/sec | taken ${registered} · dns-free ${dnsCandidates.length} · RDAP-rejected ${rdapFalsePos} · diamonds ${diamonds.length}`,
      data: {
        probed: results.length,
        registered,
        unknown,
        dnsAvailable: dnsCandidates.length,
        rdapFalsePositives: rdapFalsePos,
        rdapUnknown,
        diamonds: diamonds.length,
        ratePerSec,
        elapsed,
      },
    });
  }

  // ===== One-shot background cleanup of legacy diamonds (pre-RDAP) =====
  async runLegacyCleanup() {
    if (this.state.cleanupRunning) return;
    this.state.cleanupRunning = true;
    this.state.cleanupChecked = 0;
    this.state.cleanupRemoved = 0;
    this.emitEvent({
      kind: "info",
      message: "Starting RDAP re-verification of existing diamonds (background)",
    });
    try {
      const all = await db
        .select({ id: discoveriesTable.id, fqdn: discoveriesTable.fqdn })
        .from(discoveriesTable);
      const total = all.length;
      const CHUNK = 16;
      for (let i = 0; i < all.length; i += CHUNK) {
        if (this.stopRequested && !this.state.running) break;
        const slice = all.slice(i, i + CHUNK);
        const verdicts = await rdapBatch(
          slice.map((r) => r.fqdn),
          8,
          80,
        );
        const toDelete: number[] = [];
        const cachePersist: DnsCheckResult[] = [];
        for (let j = 0; j < slice.length; j++) {
          const v = verdicts[j]!;
          if (v.verdict === "registered") {
            toDelete.push(slice[j]!.id);
            cachePersist.push({
              fqdn: slice[j]!.fqdn,
              signal: "registered",
              evidence: v.evidence,
              checkedAt: new Date().toISOString(),
            });
          }
        }
        if (toDelete.length > 0) {
          try {
            await db
              .delete(discoveriesTable)
              .where(inArray(discoveriesTable.id, toDelete));
            await this.bulkCacheUpsert(cachePersist);
            this.state.cleanupRemoved += toDelete.length;
            this.state.totalDiscoveries = Math.max(0, this.state.totalDiscoveries - toDelete.length);
            this.emitEvent({
              kind: "info",
              message: `Cleanup: removed ${toDelete.length} parked/registered (running total ${this.state.cleanupRemoved}/${this.state.cleanupChecked + slice.length})`,
            });
          } catch (err) {
            logger.error({ err }, "Cleanup delete failed");
          }
        }
        this.state.cleanupChecked += slice.length;
        if (i % (CHUNK * 10) === 0) {
          this.emitEvent({
            kind: "info",
            message: `Cleanup progress: ${this.state.cleanupChecked}/${total} verified · ${this.state.cleanupRemoved} removed`,
          });
        }
        // Yield to let HTTP requests + main hunter cycle breathe.
        await new Promise((r) => setTimeout(r, 50));
      }
      this.emitEvent({
        kind: "info",
        message: `Cleanup complete: ${this.state.cleanupChecked} verified, ${this.state.cleanupRemoved} false positives removed`,
      });
    } catch (err) {
      logger.error({ err }, "Legacy cleanup failed");
      this.emitEvent({ kind: "error", message: `Cleanup error: ${(err as Error).message}` });
    } finally {
      this.state.cleanupRunning = false;
    }
  }

  /**
   * One-shot quality sweep over the persisted discoveries:
   *  - deletes any name that no longer passes the meaningful-word gate
   *    (legacy gibberish from before the real-word rewrite), and
   *  - refreshes valueScore for everything that survives so the live page
   *    reflects the current rating model.
   * Runs in the background on boot; never throws to the caller.
   */
  async purgeMeaninglessDiscoveries() {
    try {
      const rows = await db
        .select({
          id: discoveriesTable.id,
          name: discoveriesTable.name,
          tld: discoveriesTable.tld,
        })
        .from(discoveriesTable);
      if (rows.length === 0) return;

      const toDelete: number[] = [];
      const toRescore: { id: number; score: number }[] = [];
      for (const r of rows) {
        if (!isSellableDomain(r.name)) {
          toDelete.push(r.id);
          continue;
        }
        const s = scoreCandidate({ name: r.name, tld: r.tld, trendKeywords: [] });
        toRescore.push({ id: r.id, score: s.valueScore });
      }

      const CHUNK = 200;
      for (let i = 0; i < toDelete.length; i += CHUNK) {
        const slice = toDelete.slice(i, i + CHUNK);
        await db.delete(discoveriesTable).where(inArray(discoveriesTable.id, slice));
        await new Promise((r) => setTimeout(r, 20));
      }
      for (let i = 0; i < toRescore.length; i += CHUNK) {
        const slice = toRescore.slice(i, i + CHUNK);
        await Promise.all(
          slice.map((u) =>
            db
              .update(discoveriesTable)
              .set({ valueScore: u.score.toFixed(2) })
              .where(eq(discoveriesTable.id, u.id)),
          ),
        );
        await new Promise((r) => setTimeout(r, 20));
      }

      this.state.totalDiscoveries = Math.max(
        0,
        this.state.totalDiscoveries - toDelete.length,
      );
      if (toDelete.length > 0 || toRescore.length > 0) {
        logger.info(
          { removed: toDelete.length, rescored: toRescore.length },
          "Discovery quality sweep complete",
        );
        this.emitEvent({
          kind: "info",
          message: `Quality sweep: removed ${toDelete.length} meaningless names, refreshed ${toRescore.length} scores`,
        });
      }
    } catch (err) {
      logger.error({ err }, "purgeMeaninglessDiscoveries failed");
    }
  }

  private async loop() {
    while (!this.stopRequested) {
      try {
        await this.runCycle();
      } catch (err) {
        logger.error({ err }, "Hunter cycle error");
        this.emitEvent({
          kind: "error",
          message: `Cycle error: ${(err as Error).message}`,
        });
        await new Promise((r) => setTimeout(r, 1000));
      }
      // Tiny pause to yield event loop and let SSE clients catch up.
      await new Promise((r) => setImmediate(r));
    }
    this.state.running = false;
    this.state.startedAt = null;
    this.state.currentCategory = null;
    this.state.currentStrategy = null;
    this.emitEvent({ kind: "info", message: "Hunter stopped" });
  }
}

export const hunter = new Hunter();
