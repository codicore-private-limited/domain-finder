import { Router, type IRouter, type Request, type Response } from "express";
import { desc, sql, and, gte, eq } from "drizzle-orm";
import { db, discoveriesTable, type DiscoveryRow } from "@workspace/db";
import { hunter } from "../lib/hunter";
import { testTelegramConnection } from "../lib/telegram";

const router: IRouter = Router();

// 10-second TTL cache for count queries (expensive on 200K+ rows).
const countCache = new Map<string, { value: number; at: number }>();
async function cachedCount(
  cacheKey: string,
  query: () => Promise<number>,
  ttlMs = 10_000,
): Promise<number> {
  const hit = countCache.get(cacheKey);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await query();
  countCache.set(cacheKey, { value, at: Date.now() });
  return value;
}

function rowToDiscovery(r: DiscoveryRow) {
  return {
    id: r.id,
    fqdn: r.fqdn,
    name: r.name,
    tld: r.tld,
    category: r.category,
    strategy: r.strategy,
    pattern: r.pattern,
    length: r.length,
    valueScore: Number(r.valueScore),
    memorability: r.memorability,
    radioTest: r.radioTest === 1,
    rationale: r.rationale,
    dnsEvidence: r.dnsEvidence,
    isDiamond: r.isDiamond ?? false,
    diamondScore: r.diamondScore != null ? Number(r.diamondScore) : null,
    diamondReason: r.diamondReason ?? null,
    viewedAt: r.viewedAt instanceof Date
      ? r.viewedAt.toISOString()
      : r.viewedAt
        ? new Date(r.viewedAt as string).toISOString()
        : null,
    discoveredAt:
      r.discoveredAt instanceof Date
        ? r.discoveredAt.toISOString()
        : new Date(r.discoveredAt).toISOString(),
  };
}

router.get("/hunter/status", (_req, res): void => {
  res.json(hunter.getState());
});

router.post("/hunter/start", async (req, res): Promise<void> => {
  const minValueScore =
    typeof req.body?.minValueScore === "number"
      ? req.body.minValueScore
      : undefined;
  const batchSize =
    typeof req.body?.batchSize === "number" ? req.body.batchSize : undefined;
  const concurrency =
    typeof req.body?.concurrency === "number" ? req.body.concurrency : undefined;
  await hunter.start({ minValueScore, batchSize, concurrency });
  res.json(hunter.getState());
});

router.post("/hunter/cleanup", async (_req, res): Promise<void> => {
  // Fire-and-forget; respond immediately.
  void hunter.runLegacyCleanup();
  res.json({ ok: true, ...hunter.getState() });
});

router.post("/hunter/speed", (req, res): void => {
  hunter.setSpeed({
    batchSize:
      typeof req.body?.batchSize === "number" ? req.body.batchSize : undefined,
    concurrency:
      typeof req.body?.concurrency === "number" ? req.body.concurrency : undefined,
  });
  res.json(hunter.getState());
});

router.post("/hunter/stop", (_req, res): void => {
  hunter.stop();
  res.json(hunter.getState());
});

router.post("/hunter/reset", (_req, res): void => {
  hunter.reset();
  res.json(hunter.getState());
});

router.get("/hunter/insights", (_req, res): void => {
  res.json(hunter.getInsights());
});

router.post("/hunter/telegram-test", async (_req, res): Promise<void> => {
  const result = await testTelegramConnection();
  res.json(result);
});

router.get("/hunter/stream", (req: Request, res: Response): void => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const sinceId = Number(req.query.sinceId ?? 0);
  const initial = hunter.getRecentEvents(sinceId);
  for (const ev of initial) {
    res.write(`id: ${ev.id}\n`);
    res.write(`event: ${ev.kind}\n`);
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
  }
  res.write(
    `event: state\ndata: ${JSON.stringify(hunter.getState())}\n\n`,
  );

  const onEvent = (ev: {
    id: number;
    ts: string;
    kind: string;
    message: string;
    data?: Record<string, unknown>;
  }) => {
    res.write(`id: ${ev.id}\n`);
    res.write(`event: ${ev.kind}\n`);
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
    res.write(
      `event: state\ndata: ${JSON.stringify(hunter.getState())}\n\n`,
    );
  };
  hunter.on("event", onEvent);

  const heartbeat = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    hunter.off("event", onEvent);
    res.end();
  });
});

router.get("/discoveries", async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit ?? 100), 2000);
  const offset = Math.max(0, Number(req.query.offset ?? 0));
  const minScore = Number(req.query.minScore ?? 0);
  const category =
    typeof req.query.category === "string" && req.query.category !== "all"
      ? req.query.category
      : null;
  const strategy =
    typeof req.query.strategy === "string" && req.query.strategy !== "all"
      ? req.query.strategy
      : null;
  const lengthFilter =
    typeof req.query.length === "string" ? Number(req.query.length) : null;
  // New smart filters.
  const unseenOnly = req.query.unseen === "true";
  const diamondOnly = req.query.diamond === "true";
  const sinceDate =
    typeof req.query.since === "string" ? new Date(req.query.since) : null;

  const conds: ReturnType<typeof gte>[] = [gte(discoveriesTable.valueScore, String(minScore))];
  if (category) conds.push(eq(discoveriesTable.category, category));
  if (strategy) conds.push(eq(discoveriesTable.strategy, strategy));
  if (lengthFilter && lengthFilter >= 3 && lengthFilter <= 15) {
    conds.push(eq(discoveriesTable.length, lengthFilter));
  }
  if (unseenOnly) conds.push(sql`${discoveriesTable.viewedAt} IS NULL`);
  if (diamondOnly) conds.push(sql`${discoveriesTable.isDiamond} = true`);
  if (sinceDate && !Number.isNaN(sinceDate.getTime())) {
    conds.push(sql`${discoveriesTable.discoveredAt} >= ${sinceDate.toISOString()}`);
  }

  const where = conds.length === 1 ? conds[0] : and(...conds);

  const cacheKey = `${minScore}|${category ?? ""}|${strategy ?? ""}|${lengthFilter ?? ""}|${unseenOnly}|${diamondOnly}|${sinceDate?.toISOString() ?? ""}`;

  const sortByValue = req.query.sortBy === "value";
  const minValue = Number(req.query.minValue ?? 0);

  if (sortByValue) {
    const pool = await db
      .select()
      .from(discoveriesTable)
      .where(where)
      .orderBy(desc(discoveriesTable.valueScore))
      .limit(4000);
    const sorted = pool
      .map(rowToDiscovery)
      .sort((a, b) => b.valueScore - a.valueScore)
      .filter((d) => d.valueScore >= (Number.isFinite(minValue) ? minValue : 0));
    res.json({ total: sorted.length, offset, limit, items: sorted.slice(offset, offset + limit) });
    return;
  }

  const [rows, total] = await Promise.all([
    db
      .select()
      .from(discoveriesTable)
      .where(where)
      .orderBy(desc(discoveriesTable.isDiamond), desc(discoveriesTable.valueScore), desc(discoveriesTable.discoveredAt))
      .limit(limit)
      .offset(offset),
    cachedCount(cacheKey, async () => {
      const r = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(discoveriesTable)
        .where(where);
      return r[0]?.c ?? 0;
    }),
  ]);

  res.json({ total, offset, limit, items: rows.map(rowToDiscovery) });
});

/** Mark a discovery as "seen" so it gets filtered from the unseen view. */
router.post("/discoveries/:id/seen", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "invalid id" }); return; }
  await db.update(discoveriesTable).set({ viewedAt: new Date() }).where(eq(discoveriesTable.id, id));
  res.json({ ok: true });
});

/** Un-mark a discovery (un-seen). */
router.delete("/discoveries/:id/seen", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "invalid id" }); return; }
  await db.update(discoveriesTable).set({ viewedAt: null }).where(eq(discoveriesTable.id, id));
  res.json({ ok: true });
});

export default router;
