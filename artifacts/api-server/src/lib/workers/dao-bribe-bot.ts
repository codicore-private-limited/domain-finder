import { BaseWorker, type DiscoveredOpportunity, type RunResult } from "./base-worker";
import { safeJson } from "./_http";

interface HiddenHandProposal {
  proposal: string;
  proposalHash?: string;
  title?: string;
  protocol?: string;
  totalValue: number;       // total $ in bribes for this gauge
  voteCount?: number;       // total votes already on this gauge
  valuePerVote?: number;    // $ per vote — public denomination
  bribes?: { token: string; symbol?: string; amount: number; value: number }[];
}

interface HiddenHandResponse {
  error: boolean;
  data?: HiddenHandProposal[];
}

/**
 * Worker 10 — DAO Bribe Optimiser.
 *
 * Polls Hidden Hand's public proposal endpoints (Aura, Aerodrome, Velodrome)
 * each cycle, ranks gauges by $/vote, and emits the top candidates so the
 * user can allocate their veAURA / veAERO / veVELO toward the highest-yield
 * gauge before the epoch lock window.
 */
export class DaoBribeBotWorker extends BaseWorker {
  constructor() {
    super({
      id: "dao_bribe_bot",
      displayName: "DAO Bribe Optimiser",
      category: "defi",
      riskLevel: "medium",
      legalStatus: "clean",
      description:
        "Each cycle, fetches Hidden Hand bribe markets and ranks gauges by $/vote.",
      intervalMs: 60 * 60 * 1000,
      implemented: true,
    });
  }

  private readonly MARKETS = ["aura", "aerodrome", "velodrome"];

  protected async runOnce(): Promise<RunResult> {
    const items: DiscoveredOpportunity[] = [];
    const stats: Record<string, number> = {};

    for (const m of this.MARKETS) {
      const json = await safeJson<HiddenHandResponse>(
        `https://api.hiddenhand.finance/proposal/${m}`,
      );
      const data = json?.data ?? [];
      stats[`${m}_proposals`] = data.length;
      let kept = 0;
      for (const p of data) {
        if (!p.totalValue || p.totalValue < 100) continue;
        const dpv = p.valuePerVote && p.valuePerVote > 0
          ? p.valuePerVote
          : p.voteCount && p.voteCount > 0 ? p.totalValue / p.voteCount : 0;
        if (dpv <= 0) continue;
        // Score: log of $/vote scaled to 0..100 (0.001 -> ~10, 0.1 -> ~70, 1 -> ~95).
        const score = Math.min(100, 50 + 20 * Math.log10(dpv * 1000 + 1));
        items.push({
          externalKey: `${m}:${p.proposal}`,
          kind: "bribe_gauge",
          score,
          confidence: 70,
          payload: {
            market: m,
            proposal: p.proposal,
            title: p.title ?? null,
            protocol: p.protocol ?? null,
            totalValueUsd: p.totalValue,
            voteCount: p.voteCount ?? null,
            dollarsPerVote: Number(dpv.toFixed(6)),
            bribes: p.bribes ?? [],
            url: `https://hiddenhand.finance/${m}`,
          },
          rationale: `${m} ${p.title ?? p.proposal.slice(0, 10)} — $${dpv.toFixed(4)}/vote, $${p.totalValue.toFixed(0)} total.`,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
        kept++;
      }
      stats[`${m}_kept`] = kept;
    }

    const inserted = await this.persistOpportunities(items);
    return {
      opportunitiesFound: inserted,
      stats: { ...stats, inserted },
    };
  }
}
