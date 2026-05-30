import { db, trendSignalsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

/** Pull top-N current keyword trends — used by workers that bias scoring on news momentum. */
export async function topTrends(limit = 50): Promise<
  { keyword: string; category: string; weight: number; count24h: number }[]
> {
  const rows = await db
    .select()
    .from(trendSignalsTable)
    .orderBy(desc(trendSignalsTable.weight))
    .limit(limit);
  return rows.map((r) => ({
    keyword: r.keyword,
    category: r.category,
    weight: Number(r.weight),
    count24h: r.count24h,
  }));
}

/** Look up momentum (0..100) of any keyword inside a recent trend snapshot. */
export function trendBoost(
  needle: string,
  trends: { keyword: string; weight: number }[],
): number {
  const lc = needle.toLowerCase();
  let best = 0;
  for (const t of trends) {
    if (t.keyword === lc || lc.includes(t.keyword) || t.keyword.includes(lc)) {
      if (t.weight > best) best = t.weight;
    }
  }
  return best;
}
