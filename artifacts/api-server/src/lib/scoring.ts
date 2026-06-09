import {
  detectRealWords, meaningfulSegments, COMMON_WORDS,
  phraseDemand, isRealPhrase, isRecognizableWord, isSellableDomain,
} from "./wordlists";
import { checkTrademarkRisk } from "./trademark";

/** High-frequency common words (for the "every segment is recognizable" bonus). */
let _commonSet: Set<string> | null = null;
function commonSet(): Set<string> {
  if (!_commonSet) _commonSet = new Set(COMMON_WORDS);
  return _commonSet;
}

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

export function isVowel(ch: string): boolean {
  return VOWELS.has(ch.toLowerCase());
}

export function patternOf(name: string): string {
  return name
    .toLowerCase()
    .split("")
    .map((c) => (isVowel(c) ? "V" : "C"))
    .join("");
}

export function vowelConsonantBalance(name: string): number {
  const lower = name.toLowerCase();
  if (lower.length === 0) return 0;
  let vowels = 0;
  for (const c of lower) if (isVowel(c)) vowels++;
  const consonants = lower.length - vowels;
  if (consonants === 0) return 50;
  const ratio = vowels / lower.length;
  const distanceFromIdeal = Math.abs(ratio - 0.45);
  const score = 100 - distanceFromIdeal * 220;
  return Math.max(0, Math.min(100, score));
}

const HARD_CLUSTERS = [
  "qx",
  "xq",
  "zj",
  "jz",
  "qz",
  "zq",
  "vx",
  "xv",
  "qj",
  "jq",
  "wx",
  "xw",
  "qk",
  "kq",
  "zx",
  "xz",
];

export function hasAwkwardCluster(name: string): boolean {
  const lower = name.toLowerCase();
  for (const c of HARD_CLUSTERS) {
    if (lower.includes(c)) return true;
  }
  let consec = 0;
  for (const ch of lower) {
    if (!isVowel(ch)) {
      consec++;
      if (consec >= 4) return true;
    } else {
      consec = 0;
    }
  }
  return false;
}

export function radioTest(name: string): boolean {
  const lower = name.toLowerCase();
  if (/[^a-z]/.test(lower)) return false;
  if (hasAwkwardCluster(lower)) return false;
  if (lower.length < 4 || lower.length > 12) return false;
  const pattern = patternOf(lower);
  if (
    pattern === "CVCV" ||
    pattern === "CVCVC" ||
    pattern === "CVCCV" ||
    pattern === "CVCCVC" ||
    pattern === "VCVC" ||
    pattern === "CVVCV"
  )
    return true;
  let v = 0;
  for (const ch of lower) if (isVowel(ch)) v++;
  return v / lower.length >= 0.3 && v / lower.length <= 0.6;
}

export function memorabilityScore(name: string): number {
  let score = 70;
  const lower = name.toLowerCase();
  if (lower.length <= 5) score += 12;
  else if (lower.length <= 6) score += 8;
  else if (lower.length <= 7) score += 4;
  else if (lower.length <= 9) score += 0;
  else if (lower.length <= 11) score -= 5;
  else score -= 10;

  // Real-word bonus — domains with real words are far more memorable
  const { words, coverage } = detectRealWords(lower);
  if (words.length === 2 && coverage >= 0.95) score += 20;
  else if (words.length >= 1 && coverage >= 0.6) score += 10;
  else if (coverage < 0.3) score -= 10;

  const pattern = patternOf(lower);
  if (pattern === "CVCV" || pattern === "CVCVC") score += 12;
  else if (pattern === "CVCCV" || pattern === "CVCCVC") score += 8;

  if (hasAwkwardCluster(lower)) score -= 25;

  const repeatBonus = /(.)\1/.test(lower) ? 3 : 0;
  score += repeatBonus;

  let altCount = 0;
  for (let i = 1; i < lower.length; i++) {
    if (isVowel(lower[i] ?? "") !== isVowel(lower[i - 1] ?? "")) altCount++;
  }
  const altRatio = altCount / Math.max(1, lower.length - 1);
  score += (altRatio - 0.5) * 14;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function lengthScore(name: string): number {
  const len = name.length;
  // Short single-word domains are valuable by length alone
  if (len === 4) return 100;
  if (len === 5) return 95;
  if (len === 6) return 88;
  if (len === 7) return 78;
  // 2-word domains are typically 8-12 chars — don't over-penalize
  if (len === 8) return 70;
  if (len === 9) return 62;
  if (len === 10) return 55;
  if (len === 11) return 48;
  if (len === 12) return 42;
  if (len === 3) return 90;
  return 30;
}

export function tldScore(tld: string): number {
  const t = tld.toLowerCase();
  if (t === "com") return 100;
  if (t === "io" || t === "ai") return 80;
  if (t === "co" || t === "app" || t === "xyz") return 65;
  return 50;
}

export function trendScore(name: string, keywords: string[]): number {
  const lower = name.toLowerCase();
  let best = 30;
  for (let i = 0; i < keywords.length; i++) {
    const kw = (keywords[i] ?? "").toLowerCase();
    if (!kw) continue;
    if (lower.includes(kw)) {
      const positionWeight = Math.max(0.4, 1 - i / Math.max(1, keywords.length));
      best = Math.max(best, 70 + positionWeight * 30);
    }
  }
  return Math.round(best);
}

export function phoneticScore(name: string): number {
  const balance = vowelConsonantBalance(name);
  const radio = radioTest(name) ? 100 : 55;
  return Math.round(balance * 0.55 + radio * 0.45);
}

/**
 * Real-word detection score — now driven by exact word-break segmentation.
 * Perfect 2-word domain = 100, single real word = 92, three words = 80.
 * A name that is NOT fully made of real words can never score above ~38.
 */
export function realWordScore(name: string): number {
  const seg = meaningfulSegments(name);
  if (seg) {
    if (seg.length === 2) return 100;
    if (seg.length === 1) return 92;
    return 80; // 3 real words
  }
  // Not meaningful — only a partial embedded word at best.
  const { coverage } = detectRealWords(name);
  if (coverage >= 0.7) return 38;
  if (coverage >= 0.5) return 25;
  return 8;
}

/**
 * Crore-level potential (₹1Cr+ / $120K+ resale).
 * Based on: real-word containment × TLD × short length × trend fit.
 * Random 5-letter brandable can NEVER score above 20 here.
 */
export function crorePotentialScore(name: string, tld: string, trendKeywords: string[]): number {
  const { words, coverage } = detectRealWords(name);
  const lower = name.toLowerCase();
  let score = 0;

  // Foundation: real words are the #1 predictor of high-value sales
  if (words.length === 2 && coverage >= 0.95) {
    score += 50; // Perfect 2-word = massive baseline
  } else if (words.length === 1 && coverage >= 0.8) {
    score += 35; // Single real word
  } else if (words.length >= 1 && coverage >= 0.5) {
    score += 15;
  } else {
    score += 2; // Random brandable — almost no crore potential
  }

  // TLD multiplier
  const t = tld.toLowerCase();
  if (t === "com") score += 25;
  else if (t === "io" || t === "ai") score += 12;
  else if (t === "co") score += 8;
  else score += 3; // .in, .xyz etc

  // Length bonus (shorter = more valuable)
  if (lower.length <= 7) score += 15;
  else if (lower.length <= 9) score += 10;
  else if (lower.length <= 11) score += 5;

  // Trend relevance
  for (const kw of trendKeywords) {
    if (lower.includes(kw.toLowerCase())) {
      score += 10;
      break;
    }
  }

  return Math.min(100, Math.max(0, score));
}

export interface ScoreInput {
  name: string;
  tld: string;
  trendKeywords: string[];
}

export interface ScoreOutput {
  valueScore: number;
  breakdown: {
    length: number;
    tld: number;
    trend: number;
    phonetic: number;
    memorability: number;
    radioTest: number;
    realWord: number;
    crorePotential: number;
  };
  vowelConsonantBalance: number;
  memorability: number;
  radioTest: boolean;
  pattern: string;
}

/**
 * Real-world DESIRABILITY of a genuinely meaningful name. The number is honest:
 *  - a known real phrase is scored from its actual web-usage demand, plus a
 *    shortness bonus (short, in-demand phrases are the sellable gems);
 *  - a single real dictionary word .com is inherently premium;
 *  - a clean fused 2-3 word combo gets a solid baseline.
 * There is no fabricated "crore" rating any more — demand drives the score.
 */
function meaningfulValue(seg: string[], name: string): number {
  const len = name.length;
  let score: number;

  if (isRecognizableWord(name)) {
    // Single genuine, recognizable dictionary word — the rarest, most valuable.
    score = 72;
    if (len <= 4) score += 25;
    else if (len === 5) score += 20;
    else if (len === 6) score += 14;
    else if (len === 7) score += 8;
    else if (len === 8) score += 3;
    else score += 0;
  } else if (isRealPhrase(name)) {
    // Known real two-word concept — score from ACTUAL demand (web usage).
    const d = phraseDemand(name); // 0-100 real signal
    score = 50 + d * 0.4; // demand 100 → +40, demand 30 → +12
    if (len <= 6) score += 10;
    else if (len === 7) score += 7;
    else if (len === 8) score += 4;
    else if (len === 9) score += 2;
    else if (len === 10) score += 0;
    else if (len === 11) score -= 3;
    else score -= 6;
  } else {
    // Clean fused combo of real words (not a corpus phrase) — solid but lower.
    score = seg.length === 2 ? 70 : 60;
    if (len <= 6) score += 8;
    else if (len === 7) score += 5;
    else if (len === 8) score += 2;
    else if (len >= 11) score -= 5;
  }

  // Pronounceability.
  if (!radioTest(name)) score -= 5;
  if (hasAwkwardCluster(name)) score -= 12;

  return Math.max(40, Math.min(99, score));
}

export function scoreCandidate(input: ScoreInput): ScoreOutput {
  const { name, tld, trendKeywords } = input;
  const len = lengthScore(name);
  const tldS = tldScore(tld);
  const trend = trendScore(name, trendKeywords);
  const phonetic = phoneticScore(name);
  const memo = memorabilityScore(name);
  const radio = radioTest(name);
  const radioS = radio ? 100 : 50;
  const realWord = realWordScore(name);
  const crore = crorePotentialScore(name, tld, trendKeywords);

  const seg = meaningfulSegments(name);
  let value: number;
  if (!seg || !isSellableDomain(name)) {
    // Not a recognizable single word and not a real demand-corpus phrase →
    // gibberish, obscure scientific term, OR an arbitrary fused combo. Hard-cap
    // so it can NEVER pass the gate or look like a pick.
    value = Math.min(20, 5 + realWord * 0.3);
  } else {
    value = meaningfulValue(seg, name);
    // .com is the benchmark; alternative TLDs are worth a little less.
    const t = tld.toLowerCase();
    if (t !== "com") value -= t === "io" || t === "ai" ? 4 : 8;
    // Company / trademark protection — never surface a brand-collision name
    // with a healthy score (protects the operator from legal exposure).
    const tm = checkTrademarkRisk(name);
    if (tm.risk === "high") value = Math.min(value, 22);
    else if (tm.risk === "medium") value = Math.max(40, value - 18);
    value = Math.max(0, Math.min(99, value));
  }

  return {
    valueScore: Math.round(value * 10) / 10,
    breakdown: {
      length: Math.round(len),
      tld: Math.round(tldS),
      trend: Math.round(trend),
      phonetic: Math.round(phonetic),
      memorability: Math.round(memo),
      radioTest: Math.round(radioS),
      realWord: Math.round(realWord),
      crorePotential: Math.round(crore),
    },
    vowelConsonantBalance: Math.round(vowelConsonantBalance(name) * 10) / 10,
    memorability: memo,
    radioTest: radio,
    pattern: patternOf(name),
  };
}
