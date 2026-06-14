import { meaningfulSegments } from "./wordlists";

const KNOWN_BRANDS = [
  "google",
  "apple",
  "microsoft",
  "amazon",
  "meta",
  "facebook",
  "instagram",
  "tesla",
  "netflix",
  "openai",
  "anthropic",
  "nvidia",
  "intel",
  "ibm",
  "oracle",
  "salesforce",
  "uber",
  "airbnb",
  "spotify",
  "twitter",
  "snapchat",
  "tiktok",
  "linkedin",
  "youtube",
  "stripe",
  "shopify",
  "samsung",
  "sony",
  "adobe",
  "github",
  "gitlab",
  "atlassian",
  "slack",
  "zoom",
  "dropbox",
  "notion",
  "figma",
  "canva",
  "reddit",
  "pinterest",
  "twitch",
  "paypal",
  "venmo",
  "cashapp",
  "robinhood",
  "coinbase",
  "binance",
  "kraken",
  "ripple",
  "ethereum",
  "bitcoin",
  "solana",
  "polygon",
  "chainlink",
  "uniswap",
  "metamask",
  "deepmind",
  "cohere",
  "mistral",
  "perplexity",
  "huggingface",
  "midjourney",
  "stability",
  "runway",
  "groq",
  "cerebras",
  "graphcore",
  "rivian",
  "lucid",
  "byd",
  "ford",
  "toyota",
  "honda",
  "bmw",
  "mercedes",
  "audi",
  "porsche",
  "ferrari",
  "lamborghini",
  "rolex",
  "patek",
  "omega",
  "nike",
  "adidas",
  "puma",
  "reebok",
  "underarmour",
  "lululemon",
  "patagonia",
  "northface",
  "redbull",
  "monster",
  "pepsi",
  "coke",
  "cocacola",
  "mcdonalds",
  "burger",
  "starbucks",
  "dunkin",
  "subway",
  "chipotle",
  "domino",
  "pizzahut",
  "kfc",
  "wendys",
  "taco",
];

export interface TrademarkRiskResult {
  name: string;
  risk: "low" | "medium" | "high";
  matches: string[];
  rationale: string;
}

export function checkTrademarkRisk(name: string): TrademarkRiskResult {
  const lower = name.toLowerCase();
  const matches: string[] = [];

  // Celebrity / public-figure protection — exact or strong-boundary match only
  // (substring matching short names causes false positives, so we require the
  // full token at a word boundary and a minimum length).
  for (const celeb of CELEBRITY_NAMES) {
    if (
      celeb === lower ||
      (celeb.length >= 5 && (lower.startsWith(celeb) || lower.endsWith(celeb)))
    ) {
      return {
        name,
        risk: "high",
        matches: [celeb],
        rationale: `Collision with public figure / celebrity name "${celeb}". High right-of-publicity and trademark risk.`,
      };
    }
  }

  let strongBoundary = false;
  const segments = meaningfulSegments(lower);
  const segmentSet = new Set(segments ?? []);
  for (const brand of KNOWN_BRANDS) {
    if (brand === lower) {
      matches.push(brand);
      return {
        name,
        risk: "high",
        matches,
        rationale: `Exact match with well-known brand "${brand}". Almost certainly trademarked.`,
      };
    }
    if (brand.length < 4) continue;
    const isPrefix = lower.startsWith(brand);
    const isSuffix = lower.endsWith(brand);
    const isSegment = segmentSet.has(brand);
    // Short brands (taco, sony, coke, ford…) collide as mid-word substrings far
    // too easily (datacore ⊃ "taco"), so they only count at a word boundary or
    // as a whole word segment. Longer brands may also match mid-string.
    const isMidSubstring = brand.length >= 6 && lower.includes(brand);
    if (!isPrefix && !isSuffix && !isSegment && !isMidSubstring) continue;
    matches.push(brand);
    // A strong, recognizable brand used as a clear prefix/suffix (googlepay,
    // paypalx, applesauce) is high-risk infringement, not a mild overlap.
    if (brand.length >= 5 && (isPrefix || isSuffix)) {
      strongBoundary = true;
    }
  }

  if (matches.length === 0) {
    return {
      name,
      risk: "low",
      matches: [],
      rationale: `No collision with the curated list of well-known brands. Always run a formal USPTO/WIPO search before purchase.`,
    };
  }

  if (strongBoundary || matches.length > 1) {
    return {
      name,
      risk: "high",
      matches,
      rationale: strongBoundary
        ? `Well-known brand "${matches[0]}" used as a prefix/suffix. High infringement risk.`
        : `Multiple substring overlaps with known brands. Reconsider this name.`,
    };
  }

  return {
    name,
    risk: "medium",
    matches,
    rationale: `Substring overlap with "${matches[0]}". Could draw a cease-and-desist depending on use category.`,
  };
}

// ─────────────────────────────────────────────
// CELEBRITY / PUBLIC-FIGURE NAMES (right-of-publicity protection).
// Stored as lowercase concatenations. Matched exactly or at a word boundary.
// ─────────────────────────────────────────────
const CELEBRITY_NAMES = [
  "elonmusk", "jeffbezos", "billgates", "markzuckerberg", "stevejobs",
  "warrenbuffett", "taylorswift", "kimkardashian", "kanyewest", "kyliejenner",
  "kendalljenner", "justinbieber", "selenagomez", "arianagrande", "billieeilish",
  "ladygaga", "dualipa", "theweeknd", "shakira", "madonna", "rihanna", "beyonce",
  "cristiano", "ronaldo", "neymar", "lebron", "messi", "mbappe", "viratkohli",
  "rogerfederer", "serenawilliams", "tomhanks", "bradpitt", "angelinajolie",
  "leonardodicaprio", "robertdowney", "chrishemsworth", "scarlett", "keanureeves",
  "dwaynejohnson", "therock", "mrbeast", "pewdiepie", "oprah", "eminem",
  "drake", "kendricklamar", "snoopdogg", "katyperry",
];

// ─────────────────────────────────────────────
// NEGATIVE / DISALLOWED CONTENT (adult / gambling / pharma / spam / legal).
// Two tiers:
//   STRONG  — unambiguous substrings that almost never appear inside an innocent
//             word, so a plain substring test is safe.
//   SEGMENT — short, ambiguous tokens (sex, bet, gun, kill …) that DO appear
//             inside innocent words (essex, alphabet, begun, skill). These are
//             only flagged when they are a STANDALONE word segment or the whole
//             name — never via a naive substring match.
// ─────────────────────────────────────────────
type NegativeTier = { category: NegativeCategory; terms: string[] };

const NEGATIVE_STRONG: NegativeTier[] = [
  { category: "adult", terms: ["porn", "xxx", "hentai", "milf", "escort", "camgirl", "onlyfans", "erotic", "fetish", "brazzers", "xvideos", "redtube", "blowjob", "handjob", "creampie", "bukkake", "dildo", "boobs"] },
  { category: "gambling", terms: ["casino", "roulette", "blackjack", "baccarat", "sportsbook", "pokerstars", "jackpot"] },
  { category: "pharma", terms: ["viagra", "cialis", "oxycontin", "oxycodone", "fentanyl", "adderall", "xanax", "cocaine", "heroin", "methamphetamine", "cannabis", "marijuana"] },
  { category: "spam", terms: ["malware", "ransomware", "phishing", "keygen", "warez", "botnet"] },
  { category: "legal", terms: ["terrorist", "terrorism", "suicide", "genocide", "pedophile", "childporn"] },
];

const NEGATIVE_SEGMENT: NegativeTier[] = [
  { category: "adult", terms: ["sex", "nude", "naked", "cum", "anal", "slut", "whore", "horny", "kinky", "bdsm", "orgy"] },
  { category: "gambling", terms: ["bet", "betting", "gamble", "gambling", "poker", "slots", "lottery", "wager", "bookie"] },
  { category: "pharma", terms: ["pharma", "pill", "pills", "opioid", "opioids", "weed", "meth", "steroid", "steroids", "dope"] },
  { category: "spam", terms: ["spam", "scam", "phish", "crack"] },
  { category: "legal", terms: ["kill", "murder", "rape", "bomb", "weapon", "gun", "guns", "nazi", "isis", "drugs", "illegal", "fraud", "abuse", "torture", "hostage"] },
];

const NEGATIVE_SEGMENT_SET = new Map<string, NegativeCategory>(
  NEGATIVE_SEGMENT.flatMap((tier) => tier.terms.map((t) => [t, tier.category] as const)),
);

export type NegativeCategory = "adult" | "gambling" | "pharma" | "spam" | "legal";

export interface NegativeRiskResult {
  /** True when the name contains disallowed adult/gambling/pharma/spam/legal content. */
  flagged: boolean;
  category: NegativeCategory | null;
  matches: string[];
  rationale: string;
}

/**
 * Detect adult / gambling / pharma / spam / legal-negative content. Uses safe
 * substring matching for unambiguous terms and SEGMENT matching for short
 * ambiguous tokens, so innocent names like "skilluser" (contains "kill") and
 * "alphabet" (contains "bet") are NOT falsely flagged.
 */
export function checkNegativeRisk(name: string): NegativeRiskResult {
  const lower = name.toLowerCase().replace(/[^a-z]/g, "");
  const matches: string[] = [];
  let category: NegativeCategory | null = null;

  // Tier 1: unambiguous substrings.
  for (const tier of NEGATIVE_STRONG) {
    for (const term of tier.terms) {
      if (lower.includes(term)) {
        matches.push(term);
        category ??= tier.category;
      }
    }
  }

  // Tier 2: ambiguous tokens — only when they are a real word segment or the
  // whole name (prevents essex/alphabet/skill/begun false positives).
  const segs = meaningfulSegments(lower);
  if (segs) {
    for (const seg of segs) {
      const cat = NEGATIVE_SEGMENT_SET.get(seg);
      if (cat) {
        matches.push(seg);
        category ??= cat;
      }
    }
  } else {
    const whole = NEGATIVE_SEGMENT_SET.get(lower);
    if (whole) {
      matches.push(lower);
      category ??= whole;
    }
  }

  if (matches.length === 0) {
    return { flagged: false, category: null, matches: [], rationale: "No adult/gambling/pharma/spam/legal-negative content detected." };
  }
  return {
    flagged: true,
    category,
    matches: Array.from(new Set(matches)),
    rationale: `Disallowed ${category} content: ${Array.from(new Set(matches)).join(", ")}. Must never be surfaced as a diamond or alerted.`,
  };
}
