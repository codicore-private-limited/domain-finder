import { BaseWorker, type DiscoveredOpportunity, type RunResult } from "./base-worker";
import { topTrends, trendBoost } from "./_trends";

interface PreTgeProtocol {
  slug: string;
  name: string;
  chain: string;
  pointsUrl: string;
  baseValueTier: 1 | 2 | 3;
  tags: string[];
}

/**
 * Worker 4 — Airdrop Farmer (single-identity, compliant).
 *
 * Ranks the user's pre-TGE protocol shortlist by base value tier × current
 * news momentum (from trend_signals). NEVER multi-wallet farms.
 */
export class AirdropFarmerWorker extends BaseWorker {
  constructor() {
    super({
      id: "airdrop_farmer",
      displayName: "Airdrop Farmer",
      category: "crypto",
      riskLevel: "very_high",
      legalStatus: "tos_grey",
      description:
        "Ranks pre-TGE protocols (one identity) by expected airdrop EV using public points pages + news momentum.",
      intervalMs: 6 * 60 * 60 * 1000,
      implemented: true,
    });
  }

  private readonly PROTOCOLS: PreTgeProtocol[] = [
    { slug: "monad",        name: "Monad",          chain: "monad",       pointsUrl: "https://testnet.monad.xyz",  baseValueTier: 3, tags: ["monad", "testnet", "evm"] },
    { slug: "berachain",    name: "Berachain",      chain: "berachain",   pointsUrl: "https://berachain.com",      baseValueTier: 3, tags: ["bera", "berachain", "pol"] },
    { slug: "hyperliquid",  name: "Hyperliquid",    chain: "hyperliquid", pointsUrl: "https://app.hyperliquid.xyz",baseValueTier: 3, tags: ["hyperliquid", "perps"] },
    { slug: "fuel",         name: "Fuel",           chain: "fuel",        pointsUrl: "https://app.fuel.network",   baseValueTier: 2, tags: ["fuel"] },
    { slug: "scroll",       name: "Scroll",         chain: "scroll",      pointsUrl: "https://scroll.io",          baseValueTier: 2, tags: ["scroll", "zk"] },
    { slug: "linea",        name: "Linea",          chain: "linea",       pointsUrl: "https://linea.build",        baseValueTier: 2, tags: ["linea", "zk"] },
    { slug: "eclipse",      name: "Eclipse",        chain: "eclipse",     pointsUrl: "https://www.eclipse.xyz",    baseValueTier: 2, tags: ["eclipse", "svm"] },
    { slug: "ronin",        name: "Ronin Quests",   chain: "ronin",       pointsUrl: "https://app.roninchain.com", baseValueTier: 1, tags: ["ronin"] },
    { slug: "magiceden",    name: "Magic Eden",     chain: "multi",       pointsUrl: "https://magiceden.io",       baseValueTier: 2, tags: ["magiceden", "nft"] },
    { slug: "kamino",       name: "Kamino S2",      chain: "solana",      pointsUrl: "https://app.kamino.finance", baseValueTier: 2, tags: ["kamino", "solana"] },
    { slug: "ethena",       name: "Ethena Sats",    chain: "ethereum",    pointsUrl: "https://app.ethena.fi",      baseValueTier: 2, tags: ["ethena", "usde"] },
    { slug: "movement",     name: "Movement",       chain: "movement",    pointsUrl: "https://movementlabs.xyz",   baseValueTier: 2, tags: ["movement", "move"] },
  ];

  protected async runOnce(): Promise<RunResult> {
    const trends = await topTrends(80);
    const items: DiscoveredOpportunity[] = [];

    for (const p of this.PROTOCOLS) {
      const momentum = Math.max(...p.tags.map((t) => trendBoost(t, trends)), 0);
      const baseScore = p.baseValueTier === 3 ? 80 : p.baseValueTier === 2 ? 65 : 45;
      const score = Math.min(100, baseScore + momentum * 0.25);
      items.push({
        externalKey: p.slug,
        kind: "airdrop_quest",
        score,
        confidence: 55,
        payload: {
          name: p.name,
          chain: p.chain,
          pointsUrl: p.pointsUrl,
          baseValueTier: p.baseValueTier,
          momentum,
          actions: [
            "Verify your wallet is the only identity participating.",
            "Hit weekly quest cap, no script automation.",
            "Track gas spend ratio vs estimated payout.",
          ],
        },
        rationale: `${p.name} — tier ${p.baseValueTier} base + news momentum ${momentum.toFixed(0)}.`,
      });
    }

    const inserted = await this.persistOpportunities(items);
    return {
      opportunitiesFound: inserted,
      stats: { protocols: this.PROTOCOLS.length, inserted },
    };
  }
}
