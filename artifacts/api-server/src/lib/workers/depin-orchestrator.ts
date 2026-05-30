import { BaseWorker, type DiscoveredOpportunity, type RunResult } from "./base-worker";
import { topTrends, trendBoost } from "./_trends";

interface DepinNetwork {
  slug: string;
  name: string;
  resource: "bandwidth" | "gpu" | "wireless" | "storage" | "sensor";
  estimatedDailyUsd: number;
  effortHoursPerDay: number;
  publicUrl: string;
  tags: string[];
}

/**
 * Worker 5 — DePIN Orchestrator.
 *
 * Compares the user's eligible DePIN networks on a single $/hour-of-effort
 * basis, biased by current news momentum so impending TGE / snapshot
 * announcements bubble to the top.
 */
export class DepinOrchestratorWorker extends BaseWorker {
  constructor() {
    super({
      id: "depin_orchestrator",
      displayName: "DePIN Orchestrator",
      category: "crypto",
      riskLevel: "high",
      legalStatus: "tos_grey",
      description:
        "Ranks DePIN networks by $/hour using curated yield estimates + news momentum.",
      intervalMs: 30 * 60 * 1000,
      implemented: true,
    });
  }

  private readonly NETWORKS: DepinNetwork[] = [
    { slug: "grass",     name: "Grass",     resource: "bandwidth", estimatedDailyUsd: 0.30, effortHoursPerDay: 0.05, publicUrl: "https://grass.io",         tags: ["grass", "bandwidth"] },
    { slug: "nodepay",   name: "Nodepay",   resource: "bandwidth", estimatedDailyUsd: 0.20, effortHoursPerDay: 0.05, publicUrl: "https://nodepay.ai",       tags: ["nodepay"] },
    { slug: "bless",     name: "Bless",     resource: "bandwidth", estimatedDailyUsd: 0.15, effortHoursPerDay: 0.05, publicUrl: "https://bless.network",    tags: ["bless"] },
    { slug: "gradient",  name: "Gradient",  resource: "bandwidth", estimatedDailyUsd: 0.18, effortHoursPerDay: 0.05, publicUrl: "https://gradient.network", tags: ["gradient"] },
    { slug: "ionet",     name: "io.net",    resource: "gpu",       estimatedDailyUsd: 6.00, effortHoursPerDay: 0.20, publicUrl: "https://io.net",           tags: ["ionet", "gpu"] },
    { slug: "render",    name: "Render",    resource: "gpu",       estimatedDailyUsd: 5.00, effortHoursPerDay: 0.20, publicUrl: "https://rendernetwork.com",tags: ["render", "gpu"] },
    { slug: "akash",     name: "Akash",     resource: "gpu",       estimatedDailyUsd: 4.50, effortHoursPerDay: 0.30, publicUrl: "https://akash.network",    tags: ["akash"] },
    { slug: "helium",    name: "Helium 5G", resource: "wireless",  estimatedDailyUsd: 0.40, effortHoursPerDay: 0.10, publicUrl: "https://helium.com",       tags: ["helium", "5g"] },
    { slug: "filecoin",  name: "Filecoin",  resource: "storage",   estimatedDailyUsd: 1.20, effortHoursPerDay: 0.10, publicUrl: "https://filecoin.io",      tags: ["filecoin", "storage"] },
    { slug: "weatherxm", name: "WeatherXM", resource: "sensor",    estimatedDailyUsd: 0.80, effortHoursPerDay: 0.02, publicUrl: "https://weatherxm.com",    tags: ["weatherxm", "sensor"] },
  ];

  protected async runOnce(): Promise<RunResult> {
    const trends = await topTrends(80);
    const items: DiscoveredOpportunity[] = [];

    for (const n of this.NETWORKS) {
      const dollarsPerHour =
        n.effortHoursPerDay > 0 ? n.estimatedDailyUsd / n.effortHoursPerDay : n.estimatedDailyUsd * 24;
      const momentum = Math.max(...n.tags.map((t) => trendBoost(t, trends)), 0);
      const yieldScore = Math.min(100, 50 + 25 * Math.log10(Math.max(dollarsPerHour, 0.1) + 1));
      const score = Math.min(100, yieldScore * 0.75 + momentum * 0.25);
      items.push({
        externalKey: n.slug,
        kind: "depin_network",
        score,
        confidence: 55,
        payload: {
          name: n.name,
          resource: n.resource,
          estimatedDailyUsd: n.estimatedDailyUsd,
          effortHoursPerDay: n.effortHoursPerDay,
          dollarsPerHour: Number(dollarsPerHour.toFixed(2)),
          momentum,
          publicUrl: n.publicUrl,
        },
        rationale: `${n.name}: ~$${dollarsPerHour.toFixed(2)}/hr of effort, news momentum ${momentum.toFixed(0)}.`,
      });
    }

    const inserted = await this.persistOpportunities(items);
    return {
      opportunitiesFound: inserted,
      stats: { networks: this.NETWORKS.length, inserted },
    };
  }
}
