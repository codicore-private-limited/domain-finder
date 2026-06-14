import { sql } from "drizzle-orm";
import { db, domainSeedsTable } from "@workspace/db";
import { logger } from "../logger";
import { chatJSON, llmAvailable } from "../llm";
import type { NormalizedEvent } from "./normalizer";

/**
 * Funding / generic-keyword extractor.
 *
 * For high-signal events (large funding rounds, FDA approvals, hot research) we
 * ask the LLM to strip out company / brand names (trademark risk) and return
 * only GENERIC product/technology keywords we can safely register. These become
 * "domain seeds" that bias the Hunter toward freshly-emerging trends.
 */

const MIN_FUNDING_USD = 5_000_000; // $5M floor for funding-triggered extraction

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  m: 1_000_000,
  mn: 1_000_000,
  million: 1_000_000,
  b: 1_000_000_000,
  bn: 1_000_000_000,
  billion: 1_000_000_000,
};

/**
 * Parse the largest USD money amount mentioned in free text.
 * Handles "$50M", "$1.2 billion", "raised 750 million", "€20m" (treated as USD).
 * Returns 0 if none found.
 */
export function extractFunding(text: string): number {
  if (!text) return 0;
  const lower = text.toLowerCase();
  const re = /[$€£]?\s*(\d+(?:\.\d+)?)\s*(k|thousand|m|mn|million|b|bn|billion)\b/gi;
  let max = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower)) !== null) {
    const value = parseFloat(m[1] ?? "0");
    const mult = MULTIPLIERS[(m[2] ?? "").toLowerCase()] ?? 1;
    const amount = value * mult;
    if (amount > max) max = amount;
  }
  return max;
}

interface ExtractedSeed {
  keyword: string;
  category: string;
}

/** Heuristic: is this event worth spending an LLM call on? */
function isHighSignal(ev: NormalizedEvent, funding: number): boolean {
  if (funding >= MIN_FUNDING_USD) return true;
  if (ev.source === "fda") return true; // generic pharma names are gold
  if (ev.source === "arxiv" && ev.impactScore >= 40) return true;
  if (ev.impactScore >= 70) return true;
  return false;
}

const VALID_KEYWORD = /^[a-z]+(?: [a-z]+)?$/; // single word or two-word phrase
// Boilerplate / journalistic scaffolding that must never become a domain seed.
// A keyword is rejected if ANY of its words is in this set (so "ai platform",
// "series a", "venture capital" are all dropped, while "ai agent",
// "cloud security", "workflow automation" survive).
const BRANDY_STOPWORDS = new Set([
  // corporate / legal entity noise
  "inc", "corp", "ltd", "llc", "labs", "lab", "technologies", "technology",
  "company", "companies", "founder", "ceo", "firm", "firms",
  // funding boilerplate
  "round", "rounds", "series", "raise", "raises", "raised", "raising",
  "funding", "funded", "million", "billion", "venture", "ventures", "capital",
  "investor", "investors", "seed",
  // generic non-distinctive product words the user flagged
  "startup", "startups", "platform", "platforms", "software", "solution",
  "solutions", "plan", "plans", "report", "reports", "announce", "announces",
  "announced", "launch", "launches", "launched", "news",
]);

/**
 * Ask the LLM to extract safe generic keywords from one event.
 * Returns [] if the LLM is unavailable or returns nothing usable.
 */
async function llmExtractKeywords(
  ev: NormalizedEvent,
  funding: number,
): Promise<ExtractedSeed[]> {
  if (!llmAvailable()) return [];

  const fundingNote =
    funding > 0 ? `\nDetected funding amount: ~$${Math.round(funding / 1_000_000)}M.` : "";

  const prompt = `You are a domain-investment analyst. Read this tech/science/funding news item and extract GENERIC, brandable product or technology CONCEPTS that could become valuable .com domains in 2026.

STRICT RULES:
- REJECT any company name, brand name, product trademark or person name (trademark/UDRP risk).
- REJECT news/funding boilerplate and non-distinctive filler. NEVER return any of:
  funding, startup, startups, raises, raised, million, billion, series a, series b,
  venture capital, venture, capital, investor, round, seed, company, companies,
  platform, technology, software, solution, solutions, app, tool, news, report.
- Return only GENERIC descriptive CONCEPTS — the underlying technology or product
  category, NOT the act of raising money. Good examples:
  "ai agent", "cloud security", "workflow automation", "inference engine",
  "voice ai", "fusion battery", "gene therapy", "robot vision", "quantum chip",
  "developer workflow", "identity verification".
- Each keyword: lowercase, 1 or 2 words max, no punctuation, commercially meaningful.
  If a keyword is just a funding/boilerplate word, drop it instead of returning it.
- Pick the best category from: ai, quantum, biotech, green_energy, space_tech.

NEWS TITLE: ${ev.title}
SUMMARY: ${(ev.summary ?? "").slice(0, 600)}${fundingNote}

Return ONLY JSON: { "seeds": [ { "keyword": "...", "category": "ai" }, ... up to 5 ] }`;

  const parsed = await chatJSON<{ seeds?: ExtractedSeed[] }>(
    [
      { role: "system", content: "You output strictly valid JSON." },
      { role: "user", content: prompt },
    ],
    { temperature: 0.4, timeoutMs: 15000 },
  );

  if (!parsed?.seeds) return [];

  const validCategories = new Set(["ai", "quantum", "biotech", "green_energy", "space_tech"]);
  const out: ExtractedSeed[] = [];
  for (const s of parsed.seeds) {
    if (!s || typeof s.keyword !== "string") continue;
    const keyword = s.keyword.toLowerCase().trim().replace(/[^a-z ]/g, "").replace(/\s+/g, " ");
    if (!VALID_KEYWORD.test(keyword)) continue;
    if (keyword.length < 3 || keyword.length > 24) continue;
    // Drop obvious corporate filler words.
    if (keyword.split(" ").some((w) => BRANDY_STOPWORDS.has(w))) continue;
    const category =
      typeof s.category === "string" && validCategories.has(s.category)
        ? s.category
        : ev.categories[0] ?? "ai";
    out.push({ keyword, category });
  }
  return out;
}

/**
 * Process a batch of normalized events: gate by funding/signal, extract generic
 * keywords via LLM, and upsert them as domain seeds. Returns count inserted.
 */
export async function extractSeedsFromEvents(events: NormalizedEvent[]): Promise<number> {
  if (events.length === 0) return 0;

  // Rank by impact and only spend LLM budget on the strongest events per cycle.
  const candidates = events
    .map((ev) => ({ ev, funding: extractFunding(`${ev.title} ${ev.summary ?? ""}`) }))
    .filter(({ ev, funding }) => isHighSignal(ev, funding))
    .sort((a, b) => b.funding - a.funding || b.ev.impactScore - a.ev.impactScore)
    .slice(0, 12); // cap LLM calls per ingest cycle

  if (candidates.length === 0) return 0;

  const rows: {
    keyword: string;
    category: string;
    sourceUrl: string | null;
    sourceTitle: string;
    fundingUsd: string;
    origin: string;
    weight: string;
  }[] = [];

  for (const { ev, funding } of candidates) {
    const seeds = await llmExtractKeywords(ev, funding).catch((err) => {
      logger.debug({ err }, "LLM seed extraction failed for event");
      return [] as ExtractedSeed[];
    });
    const origin =
      ev.source === "fda" ? "pharma" : funding > 0 ? "funding" : ev.source === "arxiv" ? "research" : "trend";
    // Weight: funding size dominates, capped at 100.
    const fundingWeight = funding > 0 ? Math.min(70, (funding / 1_000_000) * 0.7) : 0;
    const weight = Math.min(100, Math.round(fundingWeight + ev.impactScore * 0.3));
    for (const s of seeds) {
      rows.push({
        keyword: s.keyword,
        category: s.category,
        sourceUrl: ev.url,
        sourceTitle: ev.title.slice(0, 300),
        fundingUsd: String(funding),
        origin,
        weight: String(weight),
      });
    }
  }

  if (rows.length === 0) return 0;

  // Dedupe by keyword within this batch — Postgres ON CONFLICT DO UPDATE cannot
  // affect the same row twice in one statement. Keep the highest-weight/funding
  // occurrence for each keyword.
  const byKeyword = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const existing = byKeyword.get(r.keyword);
    if (!existing || Number(r.weight) > Number(existing.weight)) {
      byKeyword.set(r.keyword, r);
    }
  }
  const dedupedRows = Array.from(byKeyword.values());

  try {
    const result = await db
      .insert(domainSeedsTable)
      .values(dedupedRows)
      .onConflictDoUpdate({
        target: domainSeedsTable.keyword,
        set: {
          // Refresh metadata; keep the highest weight seen.
          weight: sql`GREATEST(${domainSeedsTable.weight}, excluded.weight)`,
          fundingUsd: sql`GREATEST(${domainSeedsTable.fundingUsd}, excluded.funding_usd)`,
          category: sql`excluded.category`,
          sourceUrl: sql`excluded.source_url`,
          sourceTitle: sql`excluded.source_title`,
          origin: sql`excluded.origin`,
        },
      })
      .returning({ id: domainSeedsTable.id });
    logger.info({ seeds: result.length, fromEvents: candidates.length }, "Domain seeds extracted");
    return result.length;
  } catch (err) {
    logger.error({ err }, "Failed to persist domain seeds");
    return 0;
  }
}

/**
 * Read API for the Hunter: top fresh seeds for a category, highest weight first.
 */
export async function getSeedKeywordsForCategory(
  category: string,
  limit = 8,
): Promise<{ keyword: string; weight: number }[]> {
  try {
    const rows = await db
      .select({ keyword: domainSeedsTable.keyword, weight: domainSeedsTable.weight })
      .from(domainSeedsTable)
      .where(sql`${domainSeedsTable.category} = ${category}`)
      .orderBy(sql`${domainSeedsTable.weight} DESC, ${domainSeedsTable.createdAt} DESC`)
      .limit(limit);
    return rows.map((r) => ({ keyword: r.keyword, weight: Number(r.weight) }));
  } catch (err) {
    logger.debug({ err }, "Seed keyword query failed");
    return [];
  }
}
