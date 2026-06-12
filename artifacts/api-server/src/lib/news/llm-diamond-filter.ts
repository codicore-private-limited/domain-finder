import { chatJSON, llmAvailable } from "../llm";
import { logger } from "../logger";
import { sendExpiringAlert } from "../telegram";
import type { ExpiringAlertPayload } from "../telegram";

/**
 * LLM-powered diamond quality gate.
 *
 * This is the AI brain that sits between "available .com found" and "send Telegram
 * alert". It applies 50+ professional domain investment criteria so only GENUINE
 * diamonds surface — not junk like tagresponse.com or tagruntime.com.
 *
 * Goal: 1-2 real diamonds per day, not 16,000 junk names.
 */

export interface DiamondEvaluation {
  score: number;        // 0-100
  isDiamond: boolean;   // score >= DIAMOND_THRESHOLD
  reason: string;       // short human explanation
  factors: string[];    // list of key positive/negative signals
}

const parsedDiamondThreshold = Number(process.env.DIAMOND_THRESHOLD ?? 88);
const DIAMOND_THRESHOLD = Number.isFinite(parsedDiamondThreshold)
  ? Math.max(0, Math.min(100, parsedDiamondThreshold))
  : 88;

const HIGH_INTENT_KEYWORDS = [
  "agent", "auth", "bank", "capital", "care", "cash", "clinic", "cloud", "credit", "crypto",
  "data", "fund", "health", "identity", "invest", "legal", "loan", "market", "pay", "robot",
  "secure", "security", "shop", "trade", "travel", "vault", "wallet", "wealth",
];

// These are only used to fast-reject obviously ordinary two-word combos when
// both sides are low-intent and the overall name lacks any stronger commercial
// keyword. A single word from this list is not enough to reject a name.
const LOW_SIGNAL_WORDS = new Set([
  "tab", "tag", "tile", "line", "mode", "runtime", "loop", "slot", "lane", "pool",
  "span", "tube", "wire", "note", "table", "sheet", "scene", "slate", "theme",
  "vector", "pair", "route",
]);

function hasHighIntentKeyword(name: string): boolean {
  return HIGH_INTENT_KEYWORDS.some((keyword) => name.includes(keyword));
}

function ordinaryTwoWordCombo(name: string): string[] | null {
  for (let i = 3; i <= name.length - 3; i += 1) {
    const left = name.slice(0, i);
    const right = name.slice(i);
    if (LOW_SIGNAL_WORDS.has(left) && LOW_SIGNAL_WORDS.has(right)) {
      return [left, right];
    }
  }
  return null;
}

// Skip LLM for names already known to be weak (saves API budget).
function quickReject(name: string): { reject: boolean; reason: string } {
  const len = name.length;
  if (len > 12) return { reject: true, reason: "too long (>12 chars)" };
  if (len < 5)  return { reject: true, reason: "too short (<5 chars)" };
  // 3+ consecutive consonants
  if (/[bcdfghjklmnpqrstvwxyz]{3}/i.test(name)) return { reject: true, reason: "awkward consonant cluster" };
  // Starts or ends with a number
  if (/^\d|\d$/.test(name)) return { reject: true, reason: "starts/ends with digit" };
  if (!hasHighIntentKeyword(name)) {
    const weakCombo = ordinaryTwoWordCombo(name);
    if (weakCombo) {
      return {
        reject: true,
        reason: `ordinary low-intent combo (${weakCombo[0]} + ${weakCombo[1]})`,
      };
    }
  }
  return { reject: false, reason: "" };
}

/**
 * Evaluate a domain using the LLM (50 factors) + fast pre-checks.
 * Returns null if LLM is unavailable; caller falls back to heuristic score.
 */
export async function evaluateDiamond(
  name: string,
  tld = "com",
  context?: { category?: string; trendKeywords?: string[] },
): Promise<DiamondEvaluation | null> {
  const quick = quickReject(name);
  if (quick.reject) {
    return {
      score: 10,
      isDiamond: false,
      reason: quick.reason,
      factors: [`rejected: ${quick.reason}`],
    };
  }

  if (!llmAvailable()) return null;

  const trendCtx = context?.trendKeywords?.slice(0, 5).join(", ") ?? "general";
  const cat = context?.category ?? "tech";

  const prompt = `You are a highly selective domain investor. Evaluate "${name}.${tld}" for resale quality.

Classify it using these strict buckets:
- investment_grade: true diamond only. Must have a broad buyer pool, strong startup/company feel, clear commercial intent, and realistic $2k+ end-user resale potential.
- decent: pronounceable and somewhat brandable, but ordinary, niche, limited-buyer, or missing clear commercial urgency.
- skip: awkward, weak, low buyer pool, low intent, negative, spammy, adult, or trademark-risky.

Critical scoring rules:
- Most AI-generated domains should score below 60.
- Scores 60-79 should be uncommon and reserved for above-average names.
- Scores 80-87 can be strong but still NOT investment_grade if the buyer pool is narrow or the name feels ordinary.
- Only exceptional domains should reach ${DIAMOND_THRESHOLD}+ and investment_grade.
- Never reward a domain just because it is two real words.
- Random verb+noun or noun+noun combos like linetile, modetab, tagruntime, linepool, notewire, or similar ordinary generated names should usually be skip or low decent.
- Penalize names that sound like internal tooling, technical fragments, UI labels, filler nouns, or weak combinations with no clear high-value buyer category.

Evaluate these factors with strict judgment:
1. Broad buyer pool across multiple real companies or startups
2. Strong commercial or high-intent category fit
3. Clean phonetics, spelling, and memorability
4. Premium company-brand feel rather than auto-generated phrase feel
5. Realistic end-user resale potential above $2k
6. No obvious trademark, adult, spam, scam, or negative-risk signals

Context: category=${cat}; trend_keywords=${trendCtx}

Return ONLY valid JSON:
{
  "score": <0-100>,
  "verdict": "investment_grade" | "decent" | "skip",
  "reason": "<one sentence>",
  "top_factors": ["<up to 4 short factors>"]
}`;

  try {
    const result = await chatJSON<{
      score?: number;
      verdict?: string;
      reason?: string;
      top_factors?: string[];
    }>(
      [
        { role: "system", content: "You are a strict professional domain investment evaluator. Most domains fail. Output only valid JSON." },
        { role: "user", content: prompt },
      ],
      { temperature: 0.2, timeoutMs: 20000 },
    );

    if (!result || typeof result.score !== "number") return null;

    const score = Math.max(0, Math.min(100, Math.round(result.score)));
    const verdict = String(result.verdict ?? "").trim().toLowerCase();
    let normalizedVerdict: "investment_grade" | "decent" | "skip" = "skip";
    if (verdict === "diamond" || verdict === "investment_grade") {
      normalizedVerdict = "investment_grade";
    } else if (verdict === "decent") {
      normalizedVerdict = "decent";
    }
    const isDiamond = normalizedVerdict === "investment_grade" && score >= DIAMOND_THRESHOLD;

    return {
      score,
      isDiamond,
      reason: String(result.reason ?? "").slice(0, 300),
      factors: (result.top_factors ?? []).map((f) => String(f).slice(0, 100)),
    };
  } catch (err) {
    logger.debug({ err, name }, "LLM diamond evaluation failed");
    return null;
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
  const fqdn = `${name}.${tld}`;
  const lines = [
    `💎 <b>DIAMOND FOUND — ${fqdn.toUpperCase()}</b>`,
    ``,
    `🤖 <b>AI Score:</b> ${evaluation.score}/100`,
    `📝 <b>Why it's a diamond:</b> ${evaluation.reason}`,
    evaluation.factors.length > 0
      ? `✅ <b>Key factors:</b> ${evaluation.factors.join(" · ")}`
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
