import { BaseWorker, type DiscoveredOpportunity, type RunResult } from "./base-worker";
import { topTrends, trendBoost } from "./_trends";
import { checkTrademarkRisk } from "../trademark";

/**
 * Worker 7 — Quantum Squatter.
 *
 * The post-quantum identifier market is shallow in 2026. This worker stays
 * a watcher: it generates short brand-safe stems that would be valuable as
 * PQ-name reservations once major registries open, gated by the existing
 * trademark check so we never reserve someone's brand string.
 */
export class QuantumSquatterWorker extends BaseWorker {
  constructor() {
    super({
      id: "quantum_squatter",
      displayName: "Quantum Squatter",
      category: "crypto",
      riskLevel: "medium",
      legalStatus: "clean",
      description:
        "Reserves trademark-safe short stems for emerging post-quantum identifier registries.",
      intervalMs: 12 * 60 * 60 * 1000,
      implemented: true,
    });
  }

  private readonly STEMS = [
    "qbit", "qnet", "qore", "qlink", "qubo", "qphi", "qsec", "qid",
    "pqai", "pqml", "pqsec", "pqid", "pqkey", "pqnet",
    "axiq", "veriq", "kyberq", "dilith", "falcon", "sphincs",
    "lattic", "ringq", "isogeny",
  ];

  protected async runOnce(): Promise<RunResult> {
    const trends = await topTrends(80);
    const items: DiscoveredOpportunity[] = [];
    let blocked = 0;

    for (const stem of this.STEMS) {
      const tm = checkTrademarkRisk(stem);
      if (tm.risk === "high") {
        blocked++;
        continue;
      }
      const len = stem.length;
      const baseScore = len <= 4 ? 90 : len <= 6 ? 70 : 55;
      const momentum = Math.max(trendBoost(stem, trends), trendBoost("quantum", trends));
      const score = Math.min(100, baseScore * 0.7 + momentum * 0.3);
      items.push({
        externalKey: `pq_stem:${stem}`,
        kind: "pq_identifier",
        score,
        confidence: 35,
        payload: {
          stem,
          length: len,
          tmRisk: tm.risk,
          tmRationale: tm.rationale,
          targetRegistries: ["pq.id (placeholder)", "ENS-PQ (placeholder)", "NIST-PQC OID space"],
          momentum,
        },
        rationale: `${len}-char PQ stem "${stem}" — TM risk ${tm.risk}, momentum ${momentum.toFixed(0)}.`,
      });
    }

    const inserted = await this.persistOpportunities(items);
    return {
      opportunitiesFound: inserted,
      stats: { generated: this.STEMS.length, tmBlocked: blocked, inserted },
    };
  }
}
