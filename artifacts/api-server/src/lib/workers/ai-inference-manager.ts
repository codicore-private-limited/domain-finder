import { BaseWorker, type DiscoveredOpportunity, type RunResult } from "./base-worker";
import { topTrends, trendBoost } from "./_trends";

interface SubnetMeta {
  uid: number;
  slug: string;
  name: string;
  tags: string[];
  emissionShareEstimate: number; // 0..1, curated relative emission share
}

/**
 * Worker 11 — AI Inference Manager (Bittensor).
 *
 * Without TaoStats API credentials we can't pull a live metagraph, but we
 * can rank the top Bittensor subnets by their emission-share estimates ×
 * current AI/ML news momentum and surface re-allocation alerts. Once a
 * `TAOSTATS_API_KEY` is configured this worker should be upgraded to read
 * live `dividends` / `vTrust` / `immunity_period` per UID.
 */
export class AiInferenceManagerWorker extends BaseWorker {
  constructor() {
    super({
      id: "ai_inference_manager",
      displayName: "AI Inference Manager",
      category: "compute",
      riskLevel: "high",
      legalStatus: "clean",
      description:
        "Ranks Bittensor subnets by emission share × news momentum and surfaces re-allocation alerts.",
      intervalMs: 15 * 60 * 1000,
      implemented: true,
    });
  }

  private readonly SUBNETS: SubnetMeta[] = [
    { uid: 1,  slug: "apex",        name: "Subnet 1 — Apex (text)",        tags: ["llm", "text", "ai"],          emissionShareEstimate: 0.06 },
    { uid: 4,  slug: "targon",      name: "Subnet 4 — Targon (inference)", tags: ["inference", "llm"],            emissionShareEstimate: 0.05 },
    { uid: 5,  slug: "openkaito",   name: "Subnet 5 — Open Kaito",         tags: ["search", "ai"],                emissionShareEstimate: 0.03 },
    { uid: 6,  slug: "nous",        name: "Subnet 6 — Nous",               tags: ["llm", "training"],             emissionShareEstimate: 0.04 },
    { uid: 8,  slug: "taoshi",      name: "Subnet 8 — Taoshi",             tags: ["timeseries", "trading"],       emissionShareEstimate: 0.04 },
    { uid: 13, slug: "dataverse",   name: "Subnet 13 — Dataverse",         tags: ["data", "scraping"],            emissionShareEstimate: 0.03 },
    { uid: 19, slug: "vision",      name: "Subnet 19 — Vision",            tags: ["image", "vision", "ai"],       emissionShareEstimate: 0.04 },
    { uid: 21, slug: "filetao",     name: "Subnet 21 — FileTAO",           tags: ["storage", "data"],             emissionShareEstimate: 0.03 },
    { uid: 27, slug: "compute",     name: "Subnet 27 — Compute",           tags: ["compute", "gpu"],              emissionShareEstimate: 0.03 },
    { uid: 32, slug: "roleplay",    name: "Subnet 32 — Roleplay",          tags: ["llm"],                         emissionShareEstimate: 0.02 },
    { uid: 56, slug: "gradients",   name: "Subnet 56 — Gradients",         tags: ["training", "llm"],             emissionShareEstimate: 0.03 },
    { uid: 64, slug: "chutes",      name: "Subnet 64 — Chutes",            tags: ["inference", "compute"],        emissionShareEstimate: 0.05 },
  ];

  protected async runOnce(): Promise<RunResult> {
    const trends = await topTrends(80);
    const items: DiscoveredOpportunity[] = [];

    for (const s of this.SUBNETS) {
      const momentum = Math.max(...s.tags.map((t) => trendBoost(t, trends)), 0);
      const baseScore = Math.min(100, 30 + s.emissionShareEstimate * 800); // 1 % share -> 38, 5 % -> 70
      const score = Math.min(100, baseScore * 0.7 + momentum * 0.3);
      items.push({
        externalKey: `subnet:${s.uid}`,
        kind: "bittensor_subnet",
        score,
        confidence: 40,
        payload: {
          uid: s.uid,
          name: s.name,
          tags: s.tags,
          emissionShareEstimate: s.emissionShareEstimate,
          momentum,
          taoStatsUrl: `https://taostats.io/subnets/${s.uid}/metagraph`,
          dashboardUrl: `https://dash.taoapp.dev/subnet/${s.uid}`,
          note: "Auto-stake / auto-register disabled by design — this is a re-allocation alert only.",
        },
        rationale: `Subnet ${s.uid} (${s.slug}) — ~${(s.emissionShareEstimate * 100).toFixed(1)}% emissions, momentum ${momentum.toFixed(0)}.`,
      });
    }

    const inserted = await this.persistOpportunities(items);
    return {
      opportunitiesFound: inserted,
      stats: { subnets: this.SUBNETS.length, inserted },
    };
  }
}
