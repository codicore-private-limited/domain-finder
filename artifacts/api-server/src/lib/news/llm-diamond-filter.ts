import { chatJSON, llmAvailable, evaluatorModel } from "../llm";
import { logger } from "../logger";
import { scoreCandidate, hasAwkwardCluster } from "../scoring";
import { checkTrademarkRisk, checkNegativeRisk } from "../trademark";
import {
  hasWeakGenericNoun,
  isHighValueCategoryPhrase,
  isRealPhrase,
  isRecognizableWord,
  meaningfulSegments,
  phraseDemand,
} from "../wordlists";
import { DIAMOND_THRESHOLD as CONFIG_DIAMOND_THRESHOLD } from "../config";

/**
 * Strict premium-.com diamond gate.
 *
 * Sits between "available .com found" and "send Telegram alert". Two real words
 * do NOT make a diamond — only rare, premium, commercially powerful names that a
 * serious startup / potential unicorn could proudly use as its company name.
 *
 *   skip             0-59    awkward / weak / risky / wordlist output
 *   decent           60-74   usable, niche or ordinary buyer pool
 *   strong_watchlist 75-87   good, sellable, not rare enough for diamond
 *   diamond          >=THRESHOLD  exceptional, investor-grade
 *
 * Goal: 1-2 real diamonds per day, not 16,000 junk names.
 */

export type DiamondVerdict = "diamond" | "strong_watchlist" | "decent" | "skip";

export interface DiamondEvaluation {
  score: number;                 // 0-100
  verdict: DiamondVerdict;
  isDiamond: boolean;            // score >= DIAMOND_THRESHOLD AND verdict === "diamond"
  reason: string;               // short human explanation
  factors: string[];            // key positive/negative signals
  estimatedRetailUsd?: { low: number; high: number };
  buyerTypes?: string[];
  redFlags?: string[];
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

// Only names scoring this high get diamond treatment. DIAMOND_THRESHOLD is the
// primary env; legacy AI_DIAMOND_THRESHOLD is still honored. Default 88.
// Re-exported for consumers that previously imported from this file.
export const DIAMOND_THRESHOLD = CONFIG_DIAMOND_THRESHOLD;

const VERDICT_RANK: Record<DiamondVerdict, number> = {
  skip: 0,
  decent: 1,
  strong_watchlist: 2,
  diamond: 3,
};

/** Map a final 0-100 score to a verdict band. */
function verdictForScore(score: number): DiamondVerdict {
  if (score >= DIAMOND_THRESHOLD) return "diamond";
  if (score >= 75) return "strong_watchlist";
  if (score >= 60) return "decent";
  return "skip";
}

/** Return the stricter (lower-ranked) of two verdicts. */
function stricterVerdict(a: DiamondVerdict, b: DiamondVerdict): DiamondVerdict {
  return VERDICT_RANK[a] <= VERDICT_RANK[b] ? a : b;
}

/** Parse a model-provided verdict string into our enum (or null). */
function normalizeVerdict(v: unknown): DiamondVerdict | null {
  const s = String(v ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "diamond" || s === "strong_watchlist" || s === "decent" || s === "skip") return s;
  if (s === "watchlist" || s === "strong") return "strong_watchlist";
  return null;
}

function verdictLabel(v: DiamondVerdict): string {
  if (v === "strong_watchlist") return "Strong watchlist";
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function sanitizeStrings(arr: unknown, max: number): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim().slice(0, 100))
    .filter(Boolean)
    .slice(0, max);
}

function sanitizeRetail(v: unknown): { low: number; high: number } | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as { low?: unknown; high?: unknown };
  const low = Number(o.low);
  const high = Number(o.high);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return undefined;
  const lo = Math.max(0, Math.round(low));
  const hi = Math.max(lo, Math.round(high));
  return { low: lo, high: hi };
}

/**
 * Deterministic diamond gate — used directly when the LLM judge is unavailable,
 * rate-limited, or pending, and as the hard-cap guard on the LLM result. It is
 * intentionally CONSERVATIVE: when the AI cannot confirm a name, only an
 * unambiguously exceptional .com (a clean short recognizable word or a recognized
 * high-value commercial category) is allowed to reach diamond grade.
 */
export function evaluateLocalDiamond(
  name: string,
  tld = "com",
  context?: { category?: string; trendKeywords?: string[] },
): DiamondEvaluation {
  const lower = name.toLowerCase().replace(/[^a-z]/g, "");
  const trendKeywords = context?.trendKeywords ?? [];
  const base = scoreCandidate({ name: lower, tld, trendKeywords });
  const segments = meaningfulSegments(lower);
  const tm = checkTrademarkRisk(lower);
  const neg = checkNegativeRisk(lower);
  const factors: string[] = [];

  // scoreCandidate already applies the deterministic hard caps (TM, negative,
  // weak noun, no-buyer, niche, non-.com). Start from that capped value.
  let score = base.valueScore;

  const recognizable = isRecognizableWord(lower);
  const realPhrase = isRealPhrase(lower);
  const highValueCategory = isHighValueCategoryPhrase(lower);
  const weakNoun = hasWeakGenericNoun(lower, segments);

  if (recognizable) factors.push("recognizable one-word .com");
  else if (realPhrase) factors.push(`known phrase (demand ${phraseDemand(lower)}/100)`);
  else if (segments && segments.length >= 2) factors.push(`real-word split: ${segments.join(" + ")}`);
  if (highValueCategory) factors.push("high-value commercial category");
  if (weakNoun && !highValueCategory) factors.push("contains weak/generic filler noun");
  factors.push(base.radioTest ? "passes radio test" : "weak radio test");

  const redFlags: string[] = [];
  if (tm.risk === "high") {
    score = Math.min(score, 20);
    factors.push("trademark/celebrity collision");
    redFlags.push("trademark risk");
  } else if (tm.risk === "medium") {
    score = Math.min(score, 60);
    factors.push("medium trademark risk");
    redFlags.push("possible trademark overlap");
  }
  if (neg.flagged) {
    score = Math.min(score, 25);
    factors.push(`disallowed ${neg.category} content`);
    redFlags.push(`${neg.category} content`);
  }

  score = clampInt(score, 0, 100);
  let verdict = verdictForScore(score);

  // Extra-conservative deterministic diamond guard: when the LLM is unavailable
  // we only trust UNAMBIGUOUSLY exceptional names. Anything else is held at
  // strong_watchlist until the AI can confirm it.
  if (verdict === "diamond") {
    const trustworthy =
      base.radioTest &&
      tm.risk === "low" &&
      !neg.flagged &&
      !weakNoun &&
      lower.length <= 10 &&
      (recognizable || highValueCategory);
    if (!trustworthy) {
      score = Math.min(score, 80);
      verdict = verdictForScore(score);
      factors.push("held below diamond pending AI confirmation");
    }
  }

  const isDiamond = score >= DIAMOND_THRESHOLD && verdict === "diamond";
  const reason = isDiamond
    ? `Deterministic gate: exceptional ${recognizable ? "one-word" : "category"} .com — ${factors.slice(0, 2).join("; ")}.`
    : `${verdictLabel(verdict)} (${score}/100): ${factors.slice(0, 3).join("; ")}.`;

  return {
    score,
    verdict,
    isDiamond,
    reason,
    factors: factors.slice(0, 6),
    buyerTypes: [],
    redFlags,
  };
}

// Hard pre-filter. A rejected name can never be a diamond and skips the LLM.
function quickReject(name: string): { reject: boolean; reason: string } {
  const len = name.length;
  if (/[^a-z]/.test(name)) return { reject: true, reason: "contains digit/hyphen/non-letter" };
  if (len < 4) return { reject: true, reason: "too short (<4 chars)" };
  if (len > 10 && !isHighValueCategoryPhrase(name)) {
    return { reject: true, reason: "too long (>10 chars) and not a high-value phrase" };
  }
  if (hasAwkwardCluster(name)) return { reject: true, reason: "awkward consonant cluster" };
  const neg = checkNegativeRisk(name);
  if (neg.flagged) return { reject: true, reason: `disallowed ${neg.category} content` };
  if (checkTrademarkRisk(name).risk === "high") return { reject: true, reason: "trademark/celebrity collision" };
  return { reject: false, reason: "" };
}

const EVALUATOR_SYSTEM_PROMPT =
  "You are a brutally strict premium .com domain investor and startup naming judge.\n" +
  "Most generated domains are bad. Your job is to prevent false positives.\n" +
  "Only exceptional, investor-grade domains can be diamonds.";

interface RawEvaluation {
  score?: number;
  verdict?: string;
  isDiamond?: boolean;
  estimatedRetailUsd?: { low?: unknown; high?: unknown };
  buyerTypes?: unknown;
  reason?: string;
  top_factors?: unknown;
  red_flags?: unknown;
}

/**
 * Final strict evaluation: AI judge + deterministic hard caps. Returns the local
 * deterministic verdict when the LLM is unavailable. isDiamond is computed by US,
 * never trusted from the model, and is only true when score >= DIAMOND_THRESHOLD
 * AND the verdict is "diamond".
 */
export async function evaluateDiamond(
  name: string,
  tld = "com",
  context?: { category?: string; trendKeywords?: string[] },
): Promise<DiamondEvaluation | null> {
  const raw = name.toLowerCase().trim();
  const lower = raw.replace(/[^a-z]/g, "");

  // A digit or hyphen in the requested name is an immediate skip (premium .com
  // brands never carry them). Check the RAW input before letters-only stripping.
  if (/[0-9]/.test(raw) || raw.includes("-")) {
    return {
      score: 10,
      verdict: "skip",
      isDiamond: false,
      reason: "Rejected: contains a digit or hyphen.",
      factors: ["rejected: contains digit/hyphen"],
      redFlags: ["digit/hyphen"],
    };
  }

  const quick = quickReject(lower);
  if (quick.reject) {
    return {
      score: 10,
      verdict: "skip",
      isDiamond: false,
      reason: `Rejected: ${quick.reason}.`,
      factors: [`rejected: ${quick.reason}`],
      redFlags: [quick.reason],
    };
  }

  const local = evaluateLocalDiamond(lower, tld, context);
  if (!llmAvailable()) return local;

  const category = context?.category ?? "general";
  const trendKeywords = context?.trendKeywords?.slice(0, 6).join(", ") || "none";

  const userPrompt = `Evaluate this domain:
"${lower}.com"

Context:
Category: ${category}
Trend keywords: ${trendKeywords}

Your job:
Decide whether this is TRUE DIAMOND, STRONG WATCHLIST, DECENT, or SKIP.

Definitions:

TRUE DIAMOND:
- Could realistically be used as a serious startup/company brand
- Broad buyer pool
- Strong commercial intent
- Easy to pronounce
- Easy to spell
- Memorable after hearing once
- Looks premium on a pitch deck, app icon, billboard, and investor memo
- Has realistic $2,000+ resale potential
- Could plausibly reach much higher value if the right buyer exists
- Must feel rare, not generated
- Should usually be one of:
  1. short recognizable one-word .com
  2. smooth 5-8 letter coined brandable
  3. ultra-clear category killer compound
  4. high-commercial SaaS/AI/fintech/security/health/data name

STRONG WATCHLIST:
- Good name
- Could sell or be used by a startup
- But not rare/premium enough for diamond
- Score 75-87

DECENT:
- Usable domain
- Some buyer/use-case exists
- But niche, ordinary, weak phrase, generated feel, or limited buyer pool
- Could sell low/mid retail
- Score 60-74

SKIP:
- Awkward
- Low buyer pool
- Weak phrase
- Trademark/adult/spam/legal risk
- Needs explanation
- Sounds like random wordlist output
- Score below 60

Critical rules:
- Two real words do NOT make a diamond.
- A domain must not be diamond just because it is short.
- A domain must not be diamond just because it is pronounceable.
- A domain must not be diamond just because it contains a tech noun.
- Generated combos like linetile, skilluser, modetab, tagruntime, ratiotube, sheetpanel should usually be DECENT or SKIP, not diamond.
- Niche construction/UI/internal-tool words should not be diamond unless the phrase is a major commercial category.
- If buyer pool is unclear, max score is 65.
- If it sounds generated, max score is 70.
- If it is niche but usable, max score is 75.
- If trademark risk is high, max score is 20.
- If adult/spam/legal-negative risk exists, max score is 25.
- Only exceptional names should score 88+.
- Most generated domains should score below 60.

Evaluate these factors:
1. Length
2. Pronunciation
3. Spelling clarity
4. Memorability
5. Startup/company feel
6. Commercial intent
7. Buyer pool
8. Trend relevance
9. Category ownership
10. Resale potential
11. Trademark risk
12. Negative/adult/spam risk
13. Whether it sounds generated
14. Whether it can become a unicorn brand

Return ONLY valid JSON:
{
  "score": 0,
  "verdict": "diamond" | "strong_watchlist" | "decent" | "skip",
  "isDiamond": false,
  "estimatedRetailUsd": {
    "low": 0,
    "high": 0
  },
  "buyerTypes": ["..."],
  "reason": "one clear sentence",
  "top_factors": ["factor1", "factor2", "factor3"],
  "red_flags": ["flag1", "flag2"]
}`;

  try {
    const result = await chatJSON<RawEvaluation>(
      [
        { role: "system", content: EVALUATOR_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.1, timeoutMs: 25000, model: evaluatorModel() },
    );

    if (!result || typeof result.score !== "number") return local;

    // ── Post-processing: clamp + deterministic hard caps. Never trust the model
    //    blindly when it contradicts a hard cap. ──────────────────────────────
    const segments = meaningfulSegments(lower);
    const tm = checkTrademarkRisk(lower);
    const neg = checkNegativeRisk(lower);
    const recognizable = isRecognizableWord(lower);
    const highValueCategory = isHighValueCategoryPhrase(lower);
    const weakNoun = hasWeakGenericNoun(lower, segments);

    let score = clampInt(result.score, 0, 100);

    if (tld.toLowerCase() !== "com") score = Math.min(score, 80);
    if (weakNoun && !highValueCategory) {
      score = Math.min(score, segments && segments.length >= 2 ? 65 : 75);
    }
    // "Two real words do NOT make a diamond": a clean multi-word split that is
    // neither a recognized high-value category nor a single recognizable word can
    // never reach diamond grade — exactly the linetile/modetab/ratiotube case.
    const looksGenerated =
      !!segments && segments.length >= 2 && !highValueCategory && !recognizable;
    if (looksGenerated) score = Math.min(score, DIAMOND_THRESHOLD - 1);
    if (neg.flagged) score = Math.min(score, 25);
    if (tm.risk === "high") score = Math.min(score, 20);
    else if (tm.risk === "medium") score = Math.min(score, 60);

    const bandVerdict = verdictForScore(score);
    const modelVerdict = normalizeVerdict(result.verdict) ?? bandVerdict;
    const verdict = stricterVerdict(bandVerdict, modelVerdict);
    const isDiamond = score >= DIAMOND_THRESHOLD && verdict === "diamond";

    const factors = sanitizeStrings(result.top_factors, 5);
    const redFlags = sanitizeStrings(result.red_flags, 5);
    const buyerTypes = sanitizeStrings(result.buyerTypes, 6);

    return {
      score,
      verdict,
      isDiamond,
      reason: String(result.reason || local.reason).slice(0, 300),
      factors: factors.length ? factors : local.factors,
      estimatedRetailUsd: sanitizeRetail(result.estimatedRetailUsd),
      buyerTypes,
      redFlags,
    };
  } catch (err) {
    logger.debug({ err, name }, "LLM diamond evaluation failed");
    return local;
  }
}

/**
 * Send a rich Telegram alert for a confirmed LLM diamond.
 * This is the only alert that actually fires — no more false alarms.
 */
export async function alertDiamond(
  name: string,
  tld: string,
  evaluation: DiamondEvaluation,
  dnsEvidence: string,
): Promise<void> {
  // Hard guard: alertDiamond is the ONLY Telegram path, and it fires ONLY for a
  // confirmed diamond. Anything else (decent / strong_watchlist / skip / pending)
  // must never produce an alert.
  if (
    !evaluation.isDiamond ||
    evaluation.verdict !== "diamond" ||
    evaluation.score < DIAMOND_THRESHOLD
  ) {
    logger.debug(
      { name, score: evaluation.score, verdict: evaluation.verdict },
      "alertDiamond suppressed — not a confirmed diamond",
    );
    return;
  }

  const fqdn = `${name}.${tld}`;
  const retail = evaluation.estimatedRetailUsd;
  const lines = [
    `💎 <b>DIAMOND FOUND — ${fqdn.toUpperCase()}</b>`,
    ``,
    `🤖 <b>AI Score:</b> ${evaluation.score}/100  ·  <b>Verdict:</b> ${verdictLabel(evaluation.verdict)}`,
    `📝 <b>Why it's a diamond:</b> ${evaluation.reason}`,
    evaluation.factors.length > 0
      ? `✅ <b>Key factors:</b> ${evaluation.factors.join(" · ")}`
      : "",
    retail
      ? `💰 <b>Est. retail:</b> $${retail.low.toLocaleString()}–$${retail.high.toLocaleString()}`
      : "",
    evaluation.buyerTypes && evaluation.buyerTypes.length > 0
      ? `🧑‍💼 <b>Likely buyers:</b> ${evaluation.buyerTypes.join(", ")}`
      : "",
    evaluation.redFlags && evaluation.redFlags.length > 0
      ? `⚠️ <b>Watch-outs:</b> ${evaluation.redFlags.join(", ")}`
      : "",
    ``,
    `<b>📡 Register now (before someone else does):</b>`,
    `• <a href="https://www.namecheap.com/domains/registration/results/?domain=${fqdn}">Namecheap</a>`,
    `• <a href="https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=${fqdn}">GoDaddy</a>`,
    `• <a href="https://www.name.com/domain/search/${fqdn}">Name.com</a>`,
    ``,
    `🔍 <i>DNS: ${dnsEvidence} · RDAP: confirmed unregistered</i>`,
  ].filter(Boolean);

  try {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";
    if (!BOT_TOKEN || !CHAT_ID) return;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: lines.join("\n"),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15000),
    });
    logger.info({ fqdn, score: evaluation.score }, "Diamond Telegram alert sent");
  } catch (err) {
    logger.warn({ err, fqdn }, "Diamond Telegram alert failed");
  }
}
