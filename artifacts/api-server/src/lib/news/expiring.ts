import { EventEmitter } from "events";
import { sql } from "drizzle-orm";
import { db, expiringWatchTable, domainSeedsTable } from "@workspace/db";
import { logger } from "../logger";
import { rdapBatch, type RdapResult } from "../rdap";
import { valuate } from "../valuation";
import { sendExpiringAlert } from "../telegram";
import { REAL_PHRASES, ONE_WORD_GOOD } from "../wordlists";

/**
 * Expiring / drop-catch monitor — the realistic source of crore-grade names.
 *
 * Almost every good short/medium .com is already taken. The only realistic way
 * to get one is to catch it the moment it EXPIRES and drops. This loop walks our
 * high-value pool (curated phrases + premium short words + funding seeds),
 * RDAP-checks the TAKEN ones, and flags any that are heading toward release
 * (expiration within a window, or redemption / pendingDelete status). It then
 * alerts the user BEFORE the drop so they can set a backorder.
 */

// How soon (days) an expiration date counts as "expiring".
const EXPIRY_WINDOW_DAYS = 45;
// Names probed per cycle (keeps us well under RDAP rate limits).
const BATCH_PER_CYCLE = 60;
// RDAP concurrency — conservative to avoid 429s.
const RDAP_CONCURRENCY = 6;

const RELEASE_STATUSES = [
  "redemptionperiod",
  "pendingdelete",
  "autorenewperiod",
  "redemption period",
  "pending delete",
];

function classifyPhase(result: RdapResult): { phase: string; releasing: boolean } {
  const status = (result.status ?? []).map((s) => s.toLowerCase());
  if (status.some((s) => s.includes("pendingdelete") || s.includes("pending delete"))) {
    return { phase: "pendingDelete", releasing: true };
  }
  if (status.some((s) => s.includes("redemption"))) {
    return { phase: "redemption", releasing: true };
  }
  // Expiration date within the window?
  if (result.expirationDate) {
    const exp = new Date(result.expirationDate).getTime();
    if (!Number.isNaN(exp)) {
      const days = (exp - Date.now()) / 86_400_000;
      if (days <= EXPIRY_WINDOW_DAYS) {
        return { phase: days <= 0 ? "dropping" : "expiring", releasing: true };
      }
    }
  }
  return { phase: "active", releasing: false };
}

class ExpiringMonitor extends EventEmitter {
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private intervalMs: number;
  private cursor = 0;
  private pool: { name: string; reason: string }[] = [];
  private state = {
    lastRunAt: null as string | null,
    totalChecked: 0,
    totalReleasing: 0,
    runs: 0,
  };

  constructor(intervalMs = 60 * 60 * 1000) {
    super();
    this.intervalMs = intervalMs;
  }

  getState() {
    return { ...this.state, running: this.running, poolSize: this.pool.length };
  }

  private buildPool(seedNames: { name: string; reason: string }[]): void {
    const seen = new Set<string>();
    const pool: { name: string; reason: string }[] = [];
    const add = (name: string, reason: string) => {
      const n = name.toLowerCase().replace(/[^a-z]/g, "");
      if (n.length < 3 || n.length > 14 || seen.has(n)) return;
      seen.add(n);
      pool.push({ name: n, reason });
    };
    // 1) Funding/research seed-derived high-value names first.
    for (const s of seedNames) add(s.name, s.reason);
    // 2) Curated modern high-value phrases (demand 95).
    for (const p of REAL_PHRASES) {
      if (p.demand >= 90) add(p.phrase, "curated high-demand concept");
    }
    // 3) Premium short dictionary words (the holy-grail one-word .coms).
    for (const w of ONE_WORD_GOOD) {
      if (w.length <= 6) add(w, "premium short dictionary word");
    }
    this.pool = pool;
  }

  private async loadSeedNames(): Promise<{ name: string; reason: string }[]> {
    try {
      const rows = await db
        .select({ keyword: domainSeedsTable.keyword })
        .from(domainSeedsTable)
        .orderBy(sql`${domainSeedsTable.weight} DESC`)
        .limit(200);
      return rows
        .map((r) => r.keyword.replace(/\s+/g, ""))
        .filter((k) => /^[a-z]+$/.test(k))
        .map((k) => ({ name: k, reason: "funding/research seed keyword" }));
    } catch {
      return [];
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.safeRunOnce();
    this.timer = setInterval(() => this.safeRunOnce(), this.intervalMs);
    logger.info({ intervalMs: this.intervalMs }, "Expiring monitor started");
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private safeRunOnce() {
    this.runOnce().catch((err) => logger.error({ err }, "Expiring monitor run failed"));
  }

  async runOnce(): Promise<{ checked: number; releasing: number }> {
    if (this.pool.length === 0) {
      const seeds = await this.loadSeedNames();
      this.buildPool(seeds);
    }
    if (this.pool.length === 0) return { checked: 0, releasing: 0 };

    // Rotate through the pool across cycles.
    const start = this.cursor % this.pool.length;
    const slice: { name: string; reason: string }[] = [];
    for (let i = 0; i < BATCH_PER_CYCLE; i++) {
      slice.push(this.pool[(start + i) % this.pool.length]!);
    }
    this.cursor = (start + BATCH_PER_CYCLE) % this.pool.length;

    const fqdns = slice.map((s) => `${s.name}.com`);
    const results = await rdapBatch(fqdns, RDAP_CONCURRENCY, 50);

    let releasing = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const entry = slice[i]!;
      if (result.verdict !== "registered") continue; // only taken names can expire
      const { phase, releasing: isReleasing } = classifyPhase(result);
      if (!isReleasing) continue;
      releasing++;
      await this.recordAndAlert(entry, result, phase).catch((err) =>
        logger.debug({ err, fqdn: result.fqdn }, "Expiring record/alert failed"),
      );
    }

    this.state.lastRunAt = new Date().toISOString();
    this.state.totalChecked += results.length;
    this.state.totalReleasing += releasing;
    this.state.runs++;
    this.emit("scan", { checked: results.length, releasing });
    logger.info({ checked: results.length, releasing }, "Expiring monitor cycle complete");
    return { checked: results.length, releasing };
  }

  private async recordAndAlert(
    entry: { name: string; reason: string },
    result: RdapResult,
    phase: string,
  ): Promise<void> {
    const v = valuate({ name: entry.name, expiring: true });
    // Skip junk — don't waste alerts on names that aren't sellable.
    if (v.band === "junk" || v.band === "low") {
      // Still record (for analytics) but don't alert.
      await this.upsert(entry, result, phase, v.label, false);
      return;
    }

    // Has this fqdn already been alerted recently? Avoid spamming.
    const existing = await db
      .select({ alertedAt: expiringWatchTable.alertedAt })
      .from(expiringWatchTable)
      .where(sql`${expiringWatchTable.fqdn} = ${result.fqdn}`)
      .limit(1);
    const alreadyAlerted =
      existing[0]?.alertedAt != null &&
      Date.now() - new Date(existing[0].alertedAt).getTime() < 7 * 86_400_000;

    await this.upsert(entry, result, phase, v.label, !alreadyAlerted);

    if (!alreadyAlerted) {
      await sendExpiringAlert({
        fqdn: result.fqdn,
        phase,
        expirationDate: result.expirationDate ?? null,
        valueReason: entry.reason,
        valueBand: v.label,
        realisticUsd: v.realisticUsd,
      });
    }
  }

  private async upsert(
    entry: { name: string; reason: string },
    result: RdapResult,
    phase: string,
    valueBand: string,
    setAlerted: boolean,
  ): Promise<void> {
    await db
      .insert(expiringWatchTable)
      .values({
        fqdn: result.fqdn,
        name: entry.name,
        expirationDate: result.expirationDate ? new Date(result.expirationDate) : null,
        status: result.status ?? [],
        phase,
        valueReason: entry.reason,
        valueBand,
        alertedAt: setAlerted ? new Date() : null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: expiringWatchTable.fqdn,
        set: {
          expirationDate: sql`excluded.expiration_date`,
          status: sql`excluded.status`,
          phase: sql`excluded.phase`,
          valueBand: sql`excluded.value_band`,
          updatedAt: sql`excluded.updated_at`,
          ...(setAlerted ? { alertedAt: sql`excluded.alerted_at` } : {}),
        },
      });
  }
}

export const expiringMonitor = new ExpiringMonitor(60 * 60 * 1000);
