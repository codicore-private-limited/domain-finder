import { BaseWorker, type DiscoveredOpportunity, type RunResult } from "./base-worker";
import { topTrends, trendBoost } from "./_trends";

/**
 * Worker 2 — Fragment Hunter (TON Blockchain).
 *
 * Strategy: generate short TON @username candidates and rare +888 anonymous
 * number patterns, score by intrinsic desirability + current news momentum
 * (so e.g. "ai" / "qbit" pump when AI / quantum is trending), and emit each
 * with a deep link to fragment.com for manual verification + bid.
 *
 * Read-only signal generation. We never call Fragment automatically and we
 * never move funds.
 */
export class FragmentHunterWorker extends BaseWorker {
  constructor() {
    super({
      id: "fragment_hunter",
      displayName: "Fragment Hunter (TON)",
      category: "crypto",
      riskLevel: "medium",
      legalStatus: "clean",
      description:
        "Surfaces 2–5 char TON @usernames and rare +888 numbers ranked by news momentum.",
      intervalMs: 60 * 60 * 1000,
      implemented: true,
    });
  }

  private readonly STEMS = [
    "ai", "ml", "qx", "fx", "tx", "io", "vc", "fy", "lab", "dao",
    "btc", "eth", "ton", "sol", "rwa", "gpu", "tao", "vana", "agi", "asi",
    "bot", "neo", "lex", "axi", "qbit", "dex", "hub", "pay", "buy", "now",
    "max", "pro", "edge", "vibe", "core", "axis", "omni", "lume", "vex",
  ];

  private readonly NUM_PATTERNS = [
    "8888", "1111", "2222", "3333", "7777", "9999",
    "1234", "1337", "0007", "0420", "1221", "0110",
  ];

  protected async runOnce(): Promise<RunResult> {
    const trends = await topTrends(80);
    const items: DiscoveredOpportunity[] = [];

    for (const stem of this.STEMS) {
      const handle = stem.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (handle.length < 2 || handle.length > 5) continue;
      const len = handle.length;
      const baseScore = len === 2 ? 95 : len === 3 ? 85 : len === 4 ? 70 : 55;
      const momentum = trendBoost(handle, trends);
      const score = Math.min(100, baseScore * 0.7 + momentum * 0.3);
      items.push({
        externalKey: `username:${handle}`,
        kind: "ton_username",
        score,
        confidence: 60,
        payload: {
          handle,
          length: len,
          fragmentUrl: `https://fragment.com/username/${handle}`,
          telegramUrl: `https://t.me/${handle}`,
          momentum,
        },
        rationale: `${len}-char TON @${handle} — base ${baseScore} + momentum ${momentum.toFixed(0)}.`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    }

    for (const num of this.NUM_PATTERNS) {
      const palindrome = num === num.split("").reverse().join("");
      const allSame = new Set(num.split("")).size === 1;
      let score = 60;
      if (allSame) score = 95;
      else if (palindrome) score = 80;
      else if (num === "1234" || num === "1337") score = 75;
      items.push({
        externalKey: `anon_number:${num}`,
        kind: "ton_anon_number",
        score,
        confidence: 55,
        payload: {
          number: `+888 ${num}`,
          fragmentUrl: "https://fragment.com/numbers",
          flags: { palindrome, allSame },
        },
        rationale: `+888 ${num} — ${allSame ? "all-same digits" : palindrome ? "palindrome" : "memorable pattern"}.`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    }

    const inserted = await this.persistOpportunities(items);
    return {
      opportunitiesFound: inserted,
      stats: { generated: items.length, inserted, trendsUsed: trends.length },
    };
  }
}
