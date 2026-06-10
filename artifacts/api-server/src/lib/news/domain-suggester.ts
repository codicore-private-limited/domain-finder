import { db, discoveriesTable, dnsCacheTable, domainSeedsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../logger";
import { chatJSON, llmAvailable } from "../llm";
import { dnsAvailabilityBatch } from "../availability";
import { rdapDotComCheck } from "../rdap";
import { isSellableDomain, VERB_NOUN_POOL } from "../wordlists";
import { scoreCandidate } from "../scoring";
import { checkTrademarkRisk } from "../trademark";
import { filterLegallyAllowed } from "../legal/gate";
import { queueTelegramAlert } from "../telegram";
import { buildRationale } from "../groq";
import type { DomainSeedRow } from "@workspace/db";

/**
 * LLM-powered domain suggester.
 *
 * Pipeline: fresh funding/research seeds → LLM expands into domain name
 * candidates → DNS batch-check → RDAP confirm → save as discoveries.
 *
 * This is the "brain" component the user asked for: news events directly drive
 * new domain name generation via the GitHub Models LLM (openai/gpt-4o-mini).
 */

// How many candidates to ask the LLM for per seed keyword.
const CANDIDATES_PER_SEED = 20;
// How many top seeds to process per suggester run.
const MAX_SEEDS_PER_RUN = 6;
// DNS check concurrency (conservative to not hammer the resolver).
const DNS_CONCURRENCY = 20;

/**
 * Ask the LLM to generate brandable .com name candidates from a seed keyword.
 * Combines the LLM's creativity with our pronounceability/sellability rules.
 */
async function llmGenerateCandidates(keyword: string, category: string): Promise<string[]> {
  if (!llmAvailable()) {
    // Fallback: generate from VERB_NOUN_POOL using keyword as filter.
    return fallbackGenerate(keyword);
  }

  const prompt = `You are a domain name expert. Generate ${CANDIDATES_PER_SEED} SHORT, BRANDABLE .com domain names (name only, no .com) based on this keyword/concept: "${keyword}" (category: ${category}).

STRICT RULES:
- Each name: lowercase letters only, no hyphens, no numbers, 5-12 characters total.
- Must be pronounceable and feel like a real startup/product name.
- NO company or trademark names. Generic, descriptive brandable names only.
- Mix strategies: (1) verb+noun (getflow, setlink), (2) keyword+suffix (${keyword.replace(/\s/g, "")}hub, ${keyword.replace(/\s/g, "")}ly, ${keyword.replace(/\s/g, "")}io), (3) prefix+keyword (neo${keyword.replace(/\s/g, "").slice(0, 4)}, my${keyword.replace(/\s/g, "").slice(0, 5)}), (4) blended (drop a vowel or merge: ${keyword.replace(/\s/g, "").replace(/[aeiou]/g, "").slice(0, 4)}sync).
- Prefer 6-10 characters.

Return ONLY JSON: { "names": ["name1", "name2", ...] }`;

  const parsed = await chatJSON<{ names?: string[] }>(
    [
      { role: "system", content: "You output strictly valid JSON, names only, no explanations." },
      { role: "user", content: prompt },
    ],
    { temperature: 0.85, timeoutMs: 20000 },
  );

  if (!parsed?.names) return fallbackGenerate(keyword);

  // Clean and validate each candidate.
  const clean = parsed.names
    .filter((n): n is string => typeof n === "string")
    .map((n) => n.toLowerCase().replace(/[^a-z]/g, "").trim())
    .filter((n) => n.length >= 5 && n.length <= 12 && /^[a-z]+$/.test(n))
    .slice(0, CANDIDATES_PER_SEED);

  return clean.length > 0 ? clean : fallbackGenerate(keyword);
}

/** Fallback: pick matching names from VERB_NOUN_POOL using keyword substrings. */
function fallbackGenerate(keyword: string): string[] {
  const kw = keyword.toLowerCase().replace(/\s+/g, "");
  const tok = kw.slice(0, 4);
  return VERB_NOUN_POOL.filter((n) => n.includes(tok) || n.endsWith(kw.slice(-4))).slice(0, CANDIDATES_PER_SEED);
}

/** Main suggester: picks fresh high-weight seeds, generates names, checks them. */
export async function runDomainSuggester(): Promise<{ generated: number; checked: number; saved: number }> {
  let generated = 0;
  let checked = 0;
  let saved = 0;

  // Fetch top fresh seeds not yet processed (consumedAt IS NULL, highest weight first).
  const seeds = await db
    .select()
    .from(domainSeedsTable)
    .where(sql`${domainSeedsTable.consumedAt} IS NULL`)
    .orderBy(sql`${domainSeedsTable.weight} DESC, ${domainSeedsTable.createdAt} DESC`)
    .limit(MAX_SEEDS_PER_RUN)
    .catch((): DomainSeedRow[] => []);

  if (seeds.length === 0) {
    logger.debug("Domain suggester: no fresh seeds to process");
    return { generated, checked, saved };
  }

  logger.info({ seeds: seeds.map((s) => s.keyword) }, "Domain suggester: processing seeds via LLM");

  // Already-seen set from dns_cache to avoid re-checking known names.
  const knownFqdns = new Set(
    (await db.select({ fqdn: dnsCacheTable.fqdn }).from(dnsCacheTable).catch(() => [])).map(
      (r) => r.fqdn,
    ),
  );

  for (const seed of seeds) {
    try {
      const raw = await llmGenerateCandidates(seed.keyword, seed.category);
      generated += raw.length;

      // Quality gate: must be sellable AND pass basic filters.
      const candidates = raw.filter((n) => {
        if (knownFqdns.has(n + ".com")) return false;
        if (!isSellableDomain(n)) return false;
        const tm = checkTrademarkRisk(n);
        if (tm.risk === "high") return false;
        return true;
      });

      if (candidates.length === 0) continue;
      checked += candidates.length;

      // Batch DNS check.
      const fqdns = candidates.map((n) => n + ".com");
      const dnsResults = await dnsAvailabilityBatch(fqdns, DNS_CONCURRENCY).catch((): import("../availability").DnsCheckResult[] => []);

      const availableCandidates = dnsResults
        .filter((r) => r.signal === "available")
        .map((r) => r.fqdn.replace(/\.com$/i, ""));

      // RDAP verify each available one (authoritative for .com).
      for (const name of availableCandidates) {
        const fqdn = name + ".com";
        try {
          const rdap = await rdapDotComCheck(fqdn);
          if (rdap.verdict !== "available") continue;

          const score = scoreCandidate({ name, tld: "com", trendKeywords: [seed.keyword] });
          const rationale = buildRationale({
            name, tld: "com", category: seed.category,
            strategy: "news_driven",
            pattern: score.pattern,
            valueScore: score.valueScore,
          });

          // Legal / trademark gate.
          const legalResult = await filterLegallyAllowed([{ name, fqdn, tld: "com" }]);
          if (legalResult.allowed.length === 0) continue;

          // Save to discoveries.
          await db.insert(discoveriesTable).values({
            fqdn,
            name,
            tld: "com",
            category: seed.category,
            strategy: "news_driven",
            pattern: score.pattern,
            length: name.length,
            valueScore: String(score.valueScore),
            memorability: score.memorability,
            radioTest: score.radioTest ? 1 : 0,
            rationale: `[News-driven from "${seed.keyword}"] ${rationale}`,
            dnsEvidence: rdap.evidence,
          }).onConflictDoNothing({ target: discoveriesTable.fqdn });

          // Cache it.
          await db.insert(dnsCacheTable).values({
            fqdn, signal: "available", evidence: rdap.evidence, checkedAt: new Date(),
          }).onConflictDoUpdate({
            target: dnsCacheTable.fqdn,
            set: { signal: sql`excluded.signal`, evidence: sql`excluded.evidence`, checkedAt: sql`excluded.checked_at` },
          });

          // Telegram alert if score is high.
          if (score.valueScore >= 80) {
            queueTelegramAlert({
              name, fqdn, category: seed.category, strategy: "news_driven",
              valueScore: score.valueScore, pattern: score.pattern,
              rationale: `News-driven from "${seed.keyword}" (${seed.origin}) — ${rationale}`,
            });
          }

          saved++;
          knownFqdns.add(fqdn);
          logger.info({ fqdn, seed: seed.keyword, score: score.valueScore }, "News-driven domain saved");
        } catch (err) {
          logger.debug({ err, fqdn }, "Suggester: RDAP check failed");
        }
      }

      // Mark seed as consumed so we don't re-process it.
      await db.update(domainSeedsTable)
        .set({ consumedAt: new Date() })
        .where(eq(domainSeedsTable.id, seed.id))
        .catch(() => {});
    } catch (err) {
      logger.error({ err, seed: seed.keyword }, "Suggester: seed processing failed");
    }
  }

  if (saved > 0) {
    logger.info({ generated, checked, saved }, "Domain suggester cycle complete");
  }
  return { generated, checked, saved };
}
