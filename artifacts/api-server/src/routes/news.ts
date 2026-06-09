import { Router, type IRouter } from "express";
import {
  newsIngest,
  getRecentEvents,
  getTopTrendSignals,
} from "../lib/news/ingest";
import { expiringMonitor } from "../lib/news/expiring";
import { db, expiringWatchTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/news/status", (_req, res): void => {
  res.json(newsIngest.getState());
});

router.post("/news/ingest", async (_req, res): Promise<void> => {
  const result = await newsIngest.runOnce();
  res.json(result);
});

router.get("/news/events", async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const rows = await getRecentEvents(limit);
  res.json(
    rows.map((r) => ({
      id: r.id,
      source: r.source,
      title: r.title,
      url: r.url,
      categories: r.categories,
      keywords: r.keywords,
      impactScore: Number(r.impactScore),
      publishedAt:
        r.publishedAt instanceof Date
          ? r.publishedAt.toISOString()
          : new Date(r.publishedAt).toISOString(),
      ingestedAt:
        r.ingestedAt instanceof Date
          ? r.ingestedAt.toISOString()
          : new Date(r.ingestedAt).toISOString(),
    })),
  );
});

router.get("/news/trends", async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit ?? 30), 100);
  const rows = await getTopTrendSignals(limit);
  res.json(
    rows.map((r) => ({
      keyword: r.keyword,
      category: r.category,
      count24h: r.count24h,
      count7d: r.count7d,
      weight: Number(r.weight),
      lastSeenAt:
        r.lastSeenAt instanceof Date
          ? r.lastSeenAt.toISOString()
          : new Date(r.lastSeenAt).toISOString(),
    })),
  );
});

router.get("/news/expiring/status", (_req, res): void => {
  res.json(expiringMonitor.getState());
});

router.post("/news/expiring/scan", async (_req, res): Promise<void> => {
  const result = await expiringMonitor.runOnce();
  res.json(result);
});

router.get("/news/expiring", async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const rows = await db
    .select()
    .from(expiringWatchTable)
    .orderBy(desc(expiringWatchTable.updatedAt))
    .limit(limit);
  res.json(
    rows.map((r) => ({
      fqdn: r.fqdn,
      name: r.name,
      phase: r.phase,
      status: r.status,
      valueReason: r.valueReason,
      valueBand: r.valueBand,
      expirationDate:
        r.expirationDate instanceof Date
          ? r.expirationDate.toISOString()
          : r.expirationDate
            ? new Date(r.expirationDate).toISOString()
            : null,
      alertedAt:
        r.alertedAt instanceof Date
          ? r.alertedAt.toISOString()
          : r.alertedAt
            ? new Date(r.alertedAt).toISOString()
            : null,
    })),
  );
});

export default router;
