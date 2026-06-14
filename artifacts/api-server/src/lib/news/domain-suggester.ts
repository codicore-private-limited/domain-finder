import { db, discoveriesTable, dnsCacheTable, domainSeedsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../logger";
import { chatJSON, llmAvailable, generatorModel } from "../llm";
import { dnsAvailabilityBatch } from "../availability";
import { rdapDotComCheck } from "../rdap";
import { isSellableDomain, VERB_NOUN_POOL } from "../wordlists";
import { scoreCandidate } from "../scoring";
import { checkTrademarkRisk } from "../trademark";
import { filterLegallyAllowed } from "../legal/gate";
import { buildRationale } from "../groq";
import { evaluateDiamond, evaluateLocalDiamond, alertDiamond } from "./llm-diamond-filter";
import type { DomainSeedRow } from "@workspace/db";

/**
 * LLM-first diamond hunter.
 *
 * Architecture (exactly what the user asked for):
 *   1. Get fresh high-signal news/funding seeds (from domain_seeds table)
 *   2. Ask the LLM to generate ONLY premium, investor-grade .com candidates
 *      across three lanes (unicorn brandable / category killer / premium SaaS)
 *   3. DNS + RDAP check only those premium names (fast, tiny list)
 *   4. After RDAP confirms availability + legal gate passes, run the STRICT final
 *      evaluation (evaluateDiamond). Save the name classified by verdict; send a
 *      Telegram alert ONLY for confirmed diamonds (alertDiamond). Drop 'skip'.
 *
 * Two real words do NOT make a diamond. Watchlist/decent names are kept as
 * inventory but never trigger an alert. 1-2 real diamonds > 16,000 junk names.
 */

const CANDIDATES_PER_SEED = 12;
const MAX_SEEDS_PER_RUN = 8;
const DNS_CONCURRENCY = 20;

function normalizeCandidateName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\.com\.?$/i, "")
    .replace(/[^a-z]/g, "")
    .trim();
}

function isCleanLlmCandidate(name: string): boolean {
  if (name.length < 4 || name.length > 12) return false;
  if (!/^[a-z]+$/.test(name)) return false;
  if (/[bcdfghjklmnpqrstvwxyz]{4}/i.test(name)) return false;
  if (/[aeiou]{4}/i.test(name)) return false;
  return true;
}

/**
 * Ask the LLM to generate ONLY premium, investor-grade .com names across three
 * lanes (unicorn brandable / category killer / premium SaaS two-word). The model
 * is told quality beats quantity — returning 3 great names is better than 20 weak
 * ones. Uses LLM_GENERATOR_MODEL when configured.
 */
async function llmGenerateDiamondCandidates(
  keyword: string,
  category: string,
  trendContext: string,
): Promise<string[]> {
  if (!llmAvailable()) return fallbackGenerate(keyword);

  const prompt = `You are a world-class startup naming strategist and premium .com domain investor.

Your job is NOT to generate many names.
Your job is to generate only names that could realistically become a serious startup/company brand.

Seed keyword:
"${keyword}"

Category:
"${category}"

Trend context:
"${trendContext}"

Generate candidates in 3 lanes:

LANE A - UNICORN BRANDABLES:
- 5-8 letters preferred
- pronounceable in one clear way
- passes radio test
- easy spelling
- premium startup feel
- can work across multiple industries
- not a literal awkward two-word combo
- not random gibberish
- must feel founder-friendly and investor-friendly

LANE B - CATEGORY KILLER .COM:
- one strong English word, or
- ultra-clear commercial compound
- high buyer intent
- broad startup use
- examples of pattern: payflow, datahub, agentflow, cloudbase, healthgrid

LANE C - PREMIUM SAAS TWO-WORD:
- verb + high-value noun or noun + high-value noun
- must sound like a real product/company
- must have obvious buyers
- avoid weak nouns like tab, tile, ratio, mode, rack, slot, tube unless the full phrase is a real category

STRICT REJECT:
- no hyphens
- no numbers
- no adult/spam/pharma/gambling/legal-negative words
- no trademark names
- no celebrity/brand/company names
- no awkward generated combos
- no names that need explanation
- no names longer than 10 chars unless extremely strong
- no "two real words" unless the phrase has strong commercial meaning
- reject names like skilluser, linetile, modetab, tagruntime, ratiotube as diamond candidates

Return maximum ${CANDIDATES_PER_SEED} names.
If only 3 are truly good, return 3.
Do not fill the list with weak names.

Return ONLY valid JSON:
{
  "names": [
    {
      "name": "example",
      "lane": "unicorn_brandable" | "category_killer" | "premium_saas",
      "why": "short reason"
    }
  ]
}`;

  try {
    const parsed = await chatJSON<{ names?: Array<{ name?: string; lane?: string; why?: string } | string> }>(
      [
        { role: "system", content: "You are a world-class startup naming strategist and premium .com investor. Generate only investor-grade names. Quality over quantity. Output only valid JSON." },
        { role: "user", content: prompt },
      ],
      { temperature: 0.6, timeoutMs: 25000, model: generatorModel() },
    );

    if (!parsed?.names || !Array.isArray(parsed.names)) return fallbackGenerate(keyword);

    const seen = new Set<string>();
    const clean = parsed.names
      .map((entry) => (typeof entry === "string" ? entry : entry?.name))
      .filter((n): n is string => typeof n === "string")
      .map(normalizeCandidateName)
      .filter((n) => {
        if (!isCleanLlmCandidate(n)) return false;
        if (checkTrademarkRisk(n).risk !== "low") return false;
        if (seen.has(n)) return false;
        seen.add(n);
        return true;
      })
      .slice(0, CANDIDATES_PER_SEED);

    logger.info({ keyword, count: clean.length, names: clean }, "LLM premium candidates generated");
    return clean.length > 0 ? clean : fallbackGenerate(keyword);
  } catch (err) {
    logger.debug({ err }, "LLM generation failed");
    return fallbackGenerate(keyword);
  }
}

/** Fallback: pick from curated pool when LLM unavailable. */
function fallbackGenerate(keyword: string): string[] {
  const kw = keyword.toLowerCase().replace(/\s+/g, "");
  return VERB_NOUN_POOL
    .filter((n) => n.includes(kw.slice(0, 4)) || n.startsWith(kw.slice(0, 3)))
    .slice(0, 8);
}

/**
 * Main suggester: LLM generates quality names → DNS/RDAP verify → Telegram alert.
 */
export async function runDomainSuggester(): Promise<{ generated: number; checked: number; saved: number }> {
  let generated = 0;
  let checked = 0;
  let saved = 0;

  const seeds = await db
    .select()
    .from(domainSeedsTable)
    .where(sql`${domainSeedsTable.consumedAt} IS NULL`)
    .orderBy(sql`${domainSeedsTable.weight} DESC, ${domainSeedsTable.createdAt} DESC`)
    .limit(MAX_SEEDS_PER_RUN)
    .catch((): DomainSeedRow[] => []);

  if (seeds.length === 0) {
    logger.debug("Domain suggester: no fresh seeds");
    return { generated, checked, saved };
  }

  logger.info({ seeds: seeds.map((s) => s.keyword) }, "LLM diamond suggester running");

  const knownFqdns = new Set(
    (await db.select({ fqdn: dnsCacheTable.fqdn }).from(dnsCacheTable).catch(() => [])).map((r) => r.fqdn),
  );

  for (const seed of seeds) {
    try {
      const trendCtx = `${seed.origin}, weight ${seed.weight}`;
      const raw = await llmGenerateDiamondCandidates(seed.keyword, seed.category, trendCtx);
      generated += raw.length;

      // Quality gate: AI already applied the strict 50-factor prompt. Keep the
      // old static sellable gate as a bonus, but don't let it block every new
      // AI-coined candidate before DNS. Structural + TM checks still apply.
      const candidates = raw.filter((n) => {
        if (knownFqdns.has(n + ".com")) return false;
        if (!isSellableDomain(n) && !isCleanLlmCandidate(n)) return false;
        if (checkTrademarkRisk(n).risk !== "low") return false;
        return true;
      });

      if (candidates.length === 0) continue;
      checked += candidates.length;

      logger.info({ seed: seed.keyword, candidates }, "Checking LLM candidates via DNS");

      // DNS batch check (fast — only 10-12 names)
      const fqdns = candidates.map((n) => n + ".com");
      const dnsResults = await dnsAvailabilityBatch(fqdns, DNS_CONCURRENCY).catch(
        (): import("../availability").DnsCheckResult[] => [],
      );

      const available = dnsResults
        .filter((r) => r.signal === "available")
        .map((r) => r.fqdn.replace(/\.com$/i, ""));

      if (available.length > 0) {
        logger.info({ available }, "🎯 DNS says available — RDAP verifying...");
      }

      // RDAP verify each available (authoritative for .com), then run the strict
      // final evaluation. Telegram fires ONLY for confirmed diamonds.
      for (const name of available) {
        const fqdn = name + ".com";
        try {
          const rdap = await rdapDotComCheck(fqdn);
          if (rdap.verdict !== "available") continue;

          // Legal / trademark gate must pass before anything is persisted.
          const legalResult = await filterLegallyAllowed([{ name, fqdn, tld: "com" }]);
          if (legalResult.allowed.length === 0) continue;

          // Deterministic inventory score + cheap local diamond gate first.
          const score = scoreCandidate({ name, tld: "com", trendKeywords: [seed.keyword] });
          const localEval = evaluateLocalDiamond(name, "com", {
            category: seed.category,
            trendKeywords: [seed.keyword],
          });

          // Spend a scarce LLM evaluation ONLY on names the cheap local gate
          // already rates diamond-grade or strong. Weak combos are trusted from
          // the local gate (saved as inventory, never alerted). This is what
          // keeps 24/7 discovery alive within the free LLM token quotas instead
          // of burning the daily limit on names that can never be diamonds.
          let evaluation = localEval;
          if (localEval.verdict === "diamond" || localEval.verdict === "strong_watchlist") {
            const llmEval = await evaluateDiamond(name, "com", {
              category: seed.category,
              trendKeywords: [seed.keyword],
            });
            if (llmEval) evaluation = llmEval;
          }

          // Drop genuinely useless names; keep watchlist/decent as inventory.
          if (evaluation.verdict === "skip") {
            knownFqdns.add(fqdn);
            continue;
          }

          const isDiamond = Boolean(evaluation.isDiamond);
          const verdict = evaluation.verdict;
          const baseRationale = buildRationale({
            name, tld: "com", category: seed.category, strategy: "news_driven",
            pattern: score.pattern, valueScore: score.valueScore,
          });
          const factorNote = evaluation.factors?.length
            ? ` Factors: ${evaluation.factors.slice(0, 3).join(", ")}.`
            : "";
          const rationale = `[LLM news seed "${seed.keyword}" (${seed.origin}) · ${verdict}] ${baseRationale}${factorNote}`;

          await db.insert(discoveriesTable).values({
            fqdn, name, tld: "com",
            category: seed.category,
            strategy: "news_driven",
            pattern: score.pattern,
            length: name.length,
            valueScore: String(score.valueScore),
            memorability: score.memorability,
            radioTest: score.radioTest ? 1 : 0,
            rationale,
            dnsEvidence: rdap.evidence,
            // isDiamond is true ONLY for AI/deterministic-confirmed diamonds.
            isDiamond,
            diamondScore: String(evaluation.score),
            diamondReason: evaluation.reason,
          }).onConflictDoNothing({ target: discoveriesTable.fqdn });

          await db.insert(dnsCacheTable).values({
            fqdn, signal: "available", evidence: rdap.evidence, checkedAt: new Date(),
          }).onConflictDoUpdate({
            target: dnsCacheTable.fqdn,
            set: { signal: sql`excluded.signal`, evidence: sql`excluded.evidence`, checkedAt: sql`excluded.checked_at` },
          });

          // Telegram ONLY for confirmed diamonds — single alertDiamond() path.
          if (isDiamond) {
            await alertDiamond(name, "com", evaluation, rdap.evidence);
            logger.info({ fqdn, seed: seed.keyword, score: evaluation.score }, "LLM diamond saved + Telegram sent");
          } else {
            logger.info({ fqdn, seed: seed.keyword, verdict }, "Saved non-diamond inventory (no alert)");
          }

          saved++;
          knownFqdns.add(fqdn);
        } catch (err) {
          logger.debug({ err, fqdn }, "RDAP check failed");
        }
      }

      await db.update(domainSeedsTable).set({ consumedAt: new Date() }).where(eq(domainSeedsTable.id, seed.id)).catch(() => {});
    } catch (err) {
      logger.error({ err, seed: seed.keyword }, "Seed processing failed");
    }
  }

  if (saved > 0 || generated > 0) {
    logger.info({ generated, checked, saved }, "LLM diamond suggester cycle complete");
  }
  return { generated, checked, saved };
}
