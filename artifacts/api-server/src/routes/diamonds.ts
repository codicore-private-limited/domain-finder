import { Router, type IRouter } from "express";
import { desc, sql } from "drizzle-orm";
import { db, discoveriesTable } from "@workspace/db";
import { DIAMOND_THRESHOLD, evaluateLocalDiamond } from "../lib/news/llm-diamond-filter";

const router: IRouter = Router();

router.get("/diamonds", async (req, res): Promise<void> => {
  const min = Number(req.query.min ?? DIAMOND_THRESHOLD);
  const threshold = Number.isFinite(min) ? Math.max(0, Math.min(100, min)) : DIAMOND_THRESHOLD;
  const limit = Math.min(Math.max(Number(req.query.limit ?? 30), 1), 500);

  const rows = await db
    .select()
    .from(discoveriesTable)
    .where(sql`(
      ${discoveriesTable.isDiamond} = true
      OR ${discoveriesTable.diamondScore} >= ${String(threshold)}
      OR (${discoveriesTable.diamondScore} IS NULL AND ${discoveriesTable.valueScore} >= ${String(threshold)})
    )`)
    .orderBy(desc(discoveriesTable.isDiamond), desc(discoveriesTable.diamondScore), desc(discoveriesTable.valueScore), desc(discoveriesTable.discoveredAt))
    .limit(Math.min(limit * 20, 5000));

  const countRows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(discoveriesTable);

  const diamonds = rows.map((row) => {
    const valueScore = Number(row.valueScore);
    const diamondScore = row.diamondScore != null ? Number(row.diamondScore) : valueScore;
    const localEvaluation = evaluateLocalDiamond(row.name, row.tld, { category: row.category });
    if (!localEvaluation.isDiamond) return null;
    return {
      domain: row.fqdn,
      name: row.name,
      score: Math.round(Math.min(diamondScore, localEvaluation.score + 12)),
      source: row.isDiamond ? "AI/local confirmed" : "local pending",
      reason: row.diamondReason ?? localEvaluation.reason,
      category: row.category,
      strategy: row.strategy,
      discoveredAt: row.discoveredAt,
    };
  }).filter((row): row is NonNullable<typeof row> => row !== null).slice(0, limit);

  res.json({
    threshold,
    totalAvailable: countRows[0]?.c ?? 0,
    matched: diamonds.length,
    diamonds,
  });
});

export default router;