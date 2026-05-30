import { BaseWorker, type DiscoveredOpportunity, type RunResult } from "./base-worker";
import { checkSocialHandles } from "../social";

/**
 * Worker 3 — Social Snatcher (Instagram / X / LinkedIn).
 *
 * Compliance: read-only public probes via lib/social.ts. No automated
 * registration. When a watched 2–4 char handle reads as available we emit
 * an alert with a manual-claim deep link.
 */
export class SocialSnatcherWorker extends BaseWorker {
  constructor() {
    super({
      id: "social_snatcher",
      displayName: "Social Snatcher (IG/X)",
      category: "social",
      riskLevel: "high",
      legalStatus: "tos_grey",
      description:
        "Probes a curated list of 2–4 char IG/X/LinkedIn handles and alerts on availability drops.",
      intervalMs: 5 * 60 * 1000,
      implemented: true,
    });
  }

  private readonly WATCHLIST = [
    "ai", "ml", "qx", "fx", "tx", "io", "vc",
    "lab", "dao", "btc", "eth", "ton", "sol", "rwa", "gpu", "tao",
    "agi", "asi", "neo", "lex", "qbit", "dex", "hub", "pay", "now", "edge",
    "vibe", "mint", "pulse", "core", "axis",
  ];

  protected async runOnce(): Promise<RunResult> {
    const items: DiscoveredOpportunity[] = [];
    let probed = 0;
    let availableHits = 0;

    for (const handle of this.WATCHLIST) {
      const results = await checkSocialHandles(handle);
      probed++;
      for (const r of results) {
        if (r.available !== true) continue;
        availableHits++;
        const len = handle.length;
        const score = len === 2 ? 99 : len === 3 ? 90 : len === 4 ? 75 : 60;
        items.push({
          externalKey: `${r.platform}:${handle}`,
          kind: "social_handle",
          score,
          confidence: r.platform === "linkedin" ? 40 : 70,
          payload: {
            platform: r.platform,
            handle,
            claimUrl: r.url,
            length: len,
          },
          rationale: `${len}-char @${handle} appears AVAILABLE on ${r.platform}. Open the claim URL from your logged-in browser.`,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        });
      }
    }

    const inserted = await this.persistOpportunities(items);
    return {
      opportunitiesFound: inserted,
      stats: {
        probedHandles: probed,
        availableHits,
        watchlistSize: this.WATCHLIST.length,
      },
    };
  }
}
