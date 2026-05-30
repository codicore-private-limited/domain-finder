import { BaseWorker, type DiscoveredOpportunity, type RunResult } from "./base-worker";
import { safeJson } from "./_http";

interface LlamaPool {
  pool: string;
  project: string;
  symbol: string;
  chain: string;
  tvlUsd: number;
  apyBase?: number | null;
  apy?: number | null;
  apyMean30d?: number | null;
  ilRisk?: string;
  exposure?: string;
  category?: string;
  underlyingTokens?: string[];
}

interface LlamaPoolsResponse {
  status: string;
  data?: LlamaPool[];
}

/**
 * Worker 12 — RWA Floor Sniper (tokenized real-world assets).
 *
 * Strategy: pull DefiLlama's public yields endpoint and keep RWA-tagged
 * pools whose APY is meaningfully above their own 30-day mean (an entry
 * signal) AND whose TVL is healthy. Emit each as a "stable yield reallocation"
 * opportunity. For non-yield RWAs (watches/wine/real-estate listings) the
 * data sources are paid; we leave a hook here for when they're added.
 */
export class RwaFloorSniperWorker extends BaseWorker {
  constructor() {
    super({
      id: "rwa_floor_sniper",
      displayName: "RWA Floor Sniper",
      category: "defi",
      riskLevel: "medium",
      legalStatus: "clean",
      description:
        "Tracks tokenised RWA yield pools (DefiLlama) and surfaces APY dislocations vs 30-day mean.",
      intervalMs: 10 * 60 * 1000,
      implemented: true,
    });
  }

  private readonly RWA_PROJECTS = new Set([
    "ondo-finance", "maple-finance", "centrifuge", "goldfinch",
    "credix", "clearpool", "truefi", "flux-finance", "open-eden",
    "matrixdock", "backed-finance", "swarm",
  ]);

  protected async runOnce(): Promise<RunResult> {
    const json = await safeJson<LlamaPoolsResponse>("https://yields.llama.fi/pools");
    const pools = json?.data ?? [];
    const items: DiscoveredOpportunity[] = [];
    let rwaSeen = 0;

    for (const p of pools) {
      const isRwa =
        (p.category && p.category.toLowerCase().includes("rwa")) ||
        this.RWA_PROJECTS.has(p.project);
      if (!isRwa) continue;
      rwaSeen++;

      const tvl = p.tvlUsd ?? 0;
      const apy = p.apy ?? p.apyBase ?? 0;
      const apy30 = p.apyMean30d ?? apy;
      if (tvl < 1_000_000) continue;
      if (apy < 1) continue;

      const apyDelta = apy - apy30;
      // Score: weight by absolute APY + dislocation vs 30-day mean.
      const apyScore = Math.min(60, apy * 3);
      const deltaScore = apyDelta > 0 ? Math.min(40, apyDelta * 8) : 0;
      const score = Math.min(100, apyScore + deltaScore);
      items.push({
        externalKey: `pool:${p.pool}`,
        kind: "rwa_pool",
        score,
        confidence: 60,
        payload: {
          project: p.project,
          symbol: p.symbol,
          chain: p.chain,
          tvlUsd: tvl,
          apyPct: Number(apy.toFixed(2)),
          apyMean30dPct: Number(apy30.toFixed(2)),
          apyDeltaPct: Number(apyDelta.toFixed(2)),
          ilRisk: p.ilRisk ?? null,
          exposure: p.exposure ?? null,
          category: p.category ?? null,
          underlyingTokens: p.underlyingTokens ?? [],
          url: `https://defillama.com/yields/pool/${p.pool}`,
        },
        rationale: `${p.project} ${p.symbol} (${p.chain}) — APY ${apy.toFixed(2)}% vs 30d mean ${apy30.toFixed(2)}% (Δ ${apyDelta >= 0 ? "+" : ""}${apyDelta.toFixed(2)}%), TVL $${(tvl / 1e6).toFixed(1)}m.`,
      });
    }

    // Cap to top 50 to keep payload reasonable.
    items.sort((a, b) => b.score - a.score);
    const top = items.slice(0, 50);
    const inserted = await this.persistOpportunities(top);
    return {
      opportunitiesFound: inserted,
      stats: { poolsTotal: pools.length, rwaSeen, rwaKept: top.length, inserted },
    };
  }
}
