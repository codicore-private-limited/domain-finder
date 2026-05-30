import { BaseWorker, type DiscoveredOpportunity, type RunResult } from "./base-worker";
import { safeJson } from "./_http";

interface VastBundle {
  id: number;
  gpu_name: string;
  num_gpus: number;
  dph_total: number; // dollars per hour total
  reliability2?: number;
  cuda_max_good?: number;
  inet_down?: number;
  inet_up?: number;
  rentable?: boolean;
  rented?: boolean;
  geolocation?: string | null;
  machine_id?: number;
}

interface VastResponse {
  offers?: VastBundle[];
}

/**
 * Worker 8 — Compute Broker (GPU arbitrage).
 *
 * Polls the public Vast.ai marketplace for H100 / A100 spot bundles below a
 * target $/hr (per GPU) and emits each as a margin opportunity vs the rough
 * RunPod resale floor we compare against.
 */
export class ComputeBrokerWorker extends BaseWorker {
  constructor() {
    super({
      id: "compute_broker",
      displayName: "Compute Broker (GPU Arb)",
      category: "compute",
      riskLevel: "medium",
      legalStatus: "clean",
      description:
        "Finds underpriced H100/A100 bundles on Vast.ai vs the RunPod resale floor — quotes margin per hour.",
      intervalMs: 5 * 60 * 1000,
      implemented: true,
    });
  }

  /** Approximate RunPod / Lambda resale floor (USD per GPU-hour). */
  private readonly RESALE_FLOOR: Record<string, number> = {
    H100: 2.49,
    A100: 1.29,
    H200: 3.20,
  };

  protected async runOnce(): Promise<RunResult> {
    const items: DiscoveredOpportunity[] = [];
    const stats = { fetched: 0, kept: 0 };

    for (const gpu of Object.keys(this.RESALE_FLOOR)) {
      const q = encodeURIComponent(JSON.stringify({
        verified: { eq: true },
        rentable: { eq: true },
        gpu_name: { eq: gpu },
        order: [["dph_total", "asc"]],
      }));
      const url = `https://console.vast.ai/api/v0/bundles/?q=${q}`;
      const json = await safeJson<VastResponse>(url);
      const offers = json?.offers ?? [];
      stats.fetched += offers.length;
      const floor = this.RESALE_FLOOR[gpu]!;

      for (const o of offers.slice(0, 25)) {
        const numGpus = Math.max(o.num_gpus, 1);
        const perGpu = o.dph_total / numGpus;
        const reliability = o.reliability2 ?? 0;
        if (perGpu >= floor * 0.85) continue; // need at least ~15 % margin
        if (reliability < 0.95) continue;

        const marginUsd = floor - perGpu;
        const marginPct = (marginUsd / floor) * 100;
        const score = Math.min(100, 30 + marginPct * 1.5 + reliability * 20);
        stats.kept++;
        items.push({
          externalKey: `vast:${o.id}`,
          kind: "gpu_bundle",
          score,
          confidence: 65,
          payload: {
            provider: "vast.ai",
            offerId: o.id,
            gpu,
            numGpus,
            dphTotal: Number(o.dph_total.toFixed(3)),
            dphPerGpu: Number(perGpu.toFixed(3)),
            resaleFloor: floor,
            marginUsdPerGpuHour: Number(marginUsd.toFixed(3)),
            marginPct: Number(marginPct.toFixed(1)),
            reliability,
            inetDownMbps: o.inet_down ?? null,
            inetUpMbps: o.inet_up ?? null,
            geolocation: o.geolocation ?? null,
            url: `https://cloud.vast.ai/?ref_id=&ref_url=&search=&offer=${o.id}`,
          },
          rationale: `${gpu}×${numGpus} @ $${perGpu.toFixed(2)}/hr (floor $${floor}/hr) — ${marginPct.toFixed(0)}% margin, ${(reliability * 100).toFixed(0)}% reliability.`,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
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
