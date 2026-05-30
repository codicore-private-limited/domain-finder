import { BaseWorker, type DiscoveredOpportunity, type RunResult } from "./base-worker";
import { safeJson } from "./_http";

interface MempoolBlock {
  id: string;
  height: number;
  timestamp: number;
  tx_count: number;
}

/**
 * Worker 9 — Rare Satoshi Scanner.
 *
 * Without a configured xpub we can't enumerate the user's UTXOs, but the
 * useful, generic signal we CAN compute is:
 *   - For each new block produced, classify the block height for rarity
 *     properties (block 1, halving block, palindromic height, vintage
 *     <100k, etc.) — this matches the Ord rarity heuristics.
 *   - Emit an opportunity row per "interesting" recent block so the user
 *     can investigate inscribing the first sat of that block if they have
 *     a UTXO touching it.
 *
 * Read-only — does not move funds.
 */
export class SatoshiScannerWorker extends BaseWorker {
  constructor() {
    super({
      id: "satoshi_scanner",
      displayName: "Rare Satoshi Scanner",
      category: "crypto",
      riskLevel: "low",
      legalStatus: "clean",
      description:
        "Watches new BTC blocks and tags those whose first sat has rare ordinal properties.",
      intervalMs: 60 * 60 * 1000,
      implemented: true,
    });
  }

  private isPalindrome(n: number): boolean {
    const s = n.toString();
    return s === s.split("").reverse().join("");
  }

  private rarityOf(height: number): { rarity: string; score: number } {
    if (height === 0) return { rarity: "mythic", score: 100 };
    if (height % 210_000 === 0) return { rarity: "epic", score: 92 }; // halving
    if (height % 2016 === 0) return { rarity: "rare", score: 80 };   // difficulty epoch
    if (this.isPalindrome(height)) return { rarity: "uncommon", score: 70 };
    if (height < 100_000) return { rarity: "vintage", score: 65 };
    if (height % 1000 === 0) return { rarity: "round", score: 55 };
    return { rarity: "common", score: 0 };
  }

  protected async runOnce(): Promise<RunResult> {
    const blocks =
      (await safeJson<MempoolBlock[]>("https://mempool.space/api/v1/blocks")) ?? [];
    const items: DiscoveredOpportunity[] = [];

    for (const b of blocks) {
      const r = this.rarityOf(b.height);
      if (r.score === 0) continue;
      items.push({
        externalKey: `block:${b.height}`,
        kind: "rare_block",
        score: r.score,
        confidence: 50,
        payload: {
          blockHeight: b.height,
          blockHash: b.id,
          minedAt: new Date(b.timestamp * 1000).toISOString(),
          txCount: b.tx_count,
          rarity: r.rarity,
          mempoolUrl: `https://mempool.space/block/${b.id}`,
          ordUrl: `https://ordinals.com/sat/${b.height * 50 * 100_000_000}`,
          note:
            "If you control any UTXO whose ancestor includes the first sat of this block, consider inscribing.",
        },
        rationale: `Block ${b.height} — ${r.rarity} sat (${r.score}/100).`,
      });
    }

    const inserted = await this.persistOpportunities(items);
    return {
      opportunitiesFound: inserted,
      stats: { blocksScanned: blocks.length, rareBlocks: items.length, inserted },
    };
  }
}
