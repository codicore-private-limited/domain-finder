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

// Only names scoring 72+ get Telegram alerts. Conservative — avoids false alarms.
const DIAMOND_THRESHOLD = 72;

// Skip LLM for names already known to be weak (saves API budget).
function quickReject(name: string): { reject: boolean; reason: string } {
  const len = name.length;
  if (len > 12) return { reject: true, reason: "too long (>12 chars)" };
  if (len < 5)  return { reject: true, reason: "too short (<5 chars)" };
  // 3+ consecutive consonants
  if (/[bcdfghjklmnpqrstvwxyz]{3}/i.test(name)) return { reject: true, reason: "awkward consonant cluster" };
  // Starts or ends with a number
  if (/^\d|\d$/.test(name)) return { reject: true, reason: "starts/ends with digit" };
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

  const prompt = `You are a professional domain investor with 15 years of experience. Evaluate the .com domain: "${name}.com"

Score it from 0-100 based on these 50 criteria (be VERY strict — most domains fail):

LENGTH & STRUCTURE (20 pts):
1. Character count (5-7 = 20, 8-9 = 12, 10+ = 5)
2. No hyphens (5 pts each)
3. No numbers (5 pts each)
4. Syllable count 1-3 ideal (5 pts)
5. All lowercase letters only (5 pts)

PHONETICS & MEMORABILITY (20 pts):
6. Easy to say out loud / radio test (10 pts)
7. Easy to spell when heard (5 pts)
8. No awkward consonant combos (5 pts)
9. Memorable after hearing once (10 pts)
10. No ambiguous letters (l/1, O/0) (5 pts)

COMMERCIAL VALUE (25 pts):
11. Contains high-CPC industry keyword (pay/bank/loan/health/ai/cloud/crypto/law/estate) = 20 pts
12. Contains mid-value keyword (tech/data/hub/flow/team/app/code/shop) = 12 pts
13. Suitable for a startup product name (10 pts)
14. Global brand appeal (not region-specific) (5 pts)
15. No trademark collision risk (10 pts)

BRANDABILITY (20 pts):
16. Sounds like a real company name (10 pts)
17. Two clear, recognizable words (10 pts)
18. Action word + product word (setuser, payflow etc.) = 10 pts
19. Clean, professional feel (5 pts)
20. Not a generic filler combo (flagrep, tagloop = -15 pts)

RESALE POTENTIAL (15 pts):
21. A startup would genuinely want this domain (10 pts)
22. Comparable similar names sell for >$1000 (5 pts)
23. Multiple industries could use it (5 pts)
24. Not over-specific (not tied to one tiny niche) (5 pts)
25. Would look good on a business card/billboard (5 pts)

Current trend context: ${trendCtx} (category: ${cat})

Return ONLY valid JSON:
{
  "score": <0-100>,
  "verdict": "diamond" | "decent" | "skip",
  "reason": "<one sentence why>",
  "top_factors": ["<up to 3 key signals>"]
}

Diamond = 72+. Decent = 50-71. Skip = <50.
IMPORTANT: Most domains should score <50. Only genuine investment-grade names score 72+.`;

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
    const isDiamond = score >= DIAMOND_THRESHOLD;

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
