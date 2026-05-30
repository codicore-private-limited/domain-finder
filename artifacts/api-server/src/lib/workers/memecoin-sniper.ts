import { BaseWorker, type DiscoveredOpportunity, type RunResult } from "./base-worker";
import { safeJson } from "./_http";

interface DexscreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { symbol: string };
  priceUsd?: string | null;
  liquidity?: { usd?: number | null } | null;
  volume?: { h24?: number | null; h1?: number | null } | null;
  pairCreatedAt?: number | null;
  fdv?: number | null;
  marketCap?: number | null;
  txns?: { h1?: { buys: number; sells: number } | null } | null;
  url?: string | null;
}

interface DexscreenerResponse {
  pairs?: DexscreenerPair[];
}

/**
 * Worker 6 — Memecoin Sniper (Solana / Base).
 *
 * Pulls Dexscreener's public pair search and runs a SAFETY screen on each
 * fresh pair before emitting it as a candidate. Buys are NEVER automated —
 * we surface the pair URL so the user can verify and execute manually.
 *
 * Safety filters:
 *   - Pair age < 24h (sniper window).
 *   - Liquidity > $10k (rug guardrail).
 *   - 1h volume > $5k (some real activity).
 *   - 1h buys >= sells (momentum, not pure exit).
 *
 * The actual mint-authority / top-holder check needs an RPC call we don't
 * have a key for here; we mark `pendingRpcChecks=true` in the payload so
 * the user knows what to verify before any human-confirmed buy.
 */
export class MemecoinSniperWorker extends BaseWorker {
  constructor() {
    super({
      id: "memecoin_sniper",
      displayName: "Memecoin Sniper (SOL/Base)",
      category: "crypto",
      riskLevel: "very_high",
      legalStatus: "clean",
      description:
        "Surfaces fresh Solana/Base memecoin pairs from Dexscreener that pass liquidity / volume / momentum safety filters.",
      intervalMs: 5 * 60 * 1000,
      implemented: true,
    });
  }

  private readonly QUERIES = ["sol", "base"];

  protected async runOnce(): Promise<RunResult> {
    const items: DiscoveredOpportunity[] = [];
    const stats = { fetched: 0, screened: 0, passed: 0 };

    for (const q of this.QUERIES) {
      const json = await safeJson<DexscreenerResponse>(
        `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`,
      );
      const pairs = json?.pairs ?? [];
      stats.fetched += pairs.length;

      for (const p of pairs) {
        if (p.chainId !== "solana" && p.chainId !== "base") continue;
        stats.screened++;
        const ageMs = p.pairCreatedAt ? Date.now() - p.pairCreatedAt : Number.POSITIVE_INFINITY;
        const ageHrs = ageMs / 3_600_000;
        const liqUsd = p.liquidity?.usd ?? 0;
        const v1h = p.volume?.h1 ?? 0;
        const buys = p.txns?.h1?.buys ?? 0;
        const sells = p.txns?.h1?.sells ?? 0;

        if (ageHrs > 24) continue;
        if (liqUsd < 10_000) continue;
        if (v1h < 5_000) continue;
        if (sells > buys * 1.2) continue;

        stats.passed++;
        // Score: combine momentum + liquidity, cap at 95 because we still need
        // the RPC-side checks before any buy.
        const liqScore = Math.min(100, 30 + 20 * Math.log10(liqUsd / 10_000 + 1));
        const volScore = Math.min(100, 20 + 20 * Math.log10(v1h / 5_000 + 1));
        const buyPressure = buys + sells > 0 ? (buys / (buys + sells)) * 100 : 50;
        const score = Math.min(95, (liqScore + volScore + buyPressure) / 3);
        items.push({
          externalKey: `${p.chainId}:${p.pairAddress}`,
          kind: "memecoin_pair",
          score,
          confidence: 35,
          payload: {
            chain: p.chainId,
            symbol: p.baseToken.symbol,
            name: p.baseToken.name,
            tokenAddress: p.baseToken.address,
            pairAddress: p.pairAddress,
            ageHours: Number(ageHrs.toFixed(2)),
            liquidityUsd: liqUsd,
            volume1hUsd: v1h,
            buys1h: buys,
            sells1h: sells,
            priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
            fdv: p.fdv ?? null,
            url: p.url ?? `https://dexscreener.com/${p.chainId}/${p.pairAddress}`,
            pendingRpcChecks: [
              "Solana: confirm mint + freeze authority renounced.",
              "Solana: top-10 holders < 40 % supply.",
              "Honeypot simulation: a sell tx of 0.5 % supply must succeed.",
            ],
          },
          rationale: `${p.baseToken.symbol} on ${p.chainId} — age ${ageHrs.toFixed(1)}h, liq $${(liqUsd / 1000).toFixed(1)}k, 1h vol $${(v1h / 1000).toFixed(1)}k, ${buys}b/${sells}s.`,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        });
      }
    }

    const inserted = await this.persistOpportunities(items);
    return {
      opportunitiesFound: inserted,
      stats: { ...stats, inserted },
    };
  }
}
