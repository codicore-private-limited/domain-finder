/**
 * Diversity controls — prevent combinatorial flooding from single-template
 * permutations.
 *
 * The Verb+Noun / Noun+Noun matrix can produce hundreds of entries that share
 * the same first or second word (e.g. "laneuser", "lanedata", "lanepay",
 * "lanecloud" … and "setlane", "getlane", "ruelane" …).  Surfacing all of them
 * overwhelms the hunter and makes the output feel like a wordlist dump rather
 * than curated picks.
 *
 * `buildDiversityPool` applies per-stem caps so no single prefix or suffix can
 * dominate the pool.
 */

import { DIVERSITY_PREFIX_CAP, DIVERSITY_SUFFIX_CAP } from "./config.js";

export interface DiversityOptions {
  /** Max entries sharing the same first word/stem. Default from config. */
  prefixCap?: number;
  /** Max entries sharing the same last word/stem. Default from config. */
  suffixCap?: number;
  /** Word lists used to identify the boundary between first and second word. */
  firstWords?: Set<string>;
  /** Word lists used to identify the second word boundary. */
  secondWords?: Set<string>;
}

/**
 * Given an ordered array of candidate domain names (already quality-filtered)
 * and optional first/second word sets, return a diversity-capped subset where:
 *   - No more than `prefixCap` entries share the same first-word prefix.
 *   - No more than `suffixCap` entries share the same second-word suffix.
 *
 * The input order is preserved (earlier entries have priority), so the caller
 * should pre-sort by value/demand before calling this function.
 *
 * @param names  Ordered list of candidate names (all lowercase, letters only)
 * @param opts   Diversity options (defaults pulled from env config)
 * @returns      Filtered list with per-stem caps applied
 */
export function buildDiversityPool(
  names: string[],
  opts: DiversityOptions = {},
): string[] {
  const prefixCap = opts.prefixCap ?? DIVERSITY_PREFIX_CAP;
  const suffixCap = opts.suffixCap ?? DIVERSITY_SUFFIX_CAP;
  const firstWords = opts.firstWords;
  const secondWords = opts.secondWords;

  const prefixCount = new Map<string, number>();
  const suffixCount = new Map<string, number>();
  const out: string[] = [];

  for (const name of names) {
    const lower = name.toLowerCase().replace(/[^a-z]/g, "");
    if (!lower) continue;

    const { prefix, suffix } = splitStem(lower, firstWords, secondWords);

    const pc = prefixCount.get(prefix) ?? 0;
    const sc = suffixCount.get(suffix) ?? 0;

    if (pc >= prefixCap || sc >= suffixCap) continue;

    prefixCount.set(prefix, pc + 1);
    suffixCount.set(suffix, sc + 1);
    out.push(lower);
  }

  return out;
}

/**
 * Split a fused domain name into a (prefix, suffix) pair for diversity counting.
 *
 * Strategy (in priority order):
 * 1. If `firstWords` is provided and a known first-word prefix is found, use it.
 * 2. If `secondWords` is provided and a known second-word suffix is found, use it.
 * 3. Fall back to splitting at the midpoint for unknown/opaque names.
 *
 * Both prefix and suffix are always non-empty strings.
 */
export function splitStem(
  name: string,
  firstWords?: Set<string>,
  secondWords?: Set<string>,
): { prefix: string; suffix: string } {
  const n = name.length;
  if (n <= 3) return { prefix: name, suffix: name };

  // Try to split on a known first-word boundary (longest match wins)
  if (firstWords) {
    for (let end = Math.min(n - 2, 8); end >= 2; end--) {
      const candidate = name.slice(0, end);
      if (firstWords.has(candidate)) {
        return { prefix: candidate, suffix: name.slice(end) || name };
      }
    }
  }

  // Try to split on a known second-word boundary (longest match wins)
  if (secondWords) {
    for (let start = Math.max(2, n - 8); start <= n - 2; start++) {
      const candidate = name.slice(start);
      if (secondWords.has(candidate)) {
        return { prefix: name.slice(0, start) || name, suffix: candidate };
      }
    }
  }

  // Fallback: mid-split
  const mid = Math.floor(n / 2);
  return { prefix: name.slice(0, mid), suffix: name.slice(mid) };
}

/**
 * Convenience: apply diversity cap to a Verb+Noun / Noun+Noun pool where
 * both word sets are known.
 */
export function capVerbNounPool(
  names: string[],
  verbs: Set<string>,
  nouns: Set<string>,
  prefixCap = DIVERSITY_PREFIX_CAP,
  suffixCap = DIVERSITY_SUFFIX_CAP,
): string[] {
  return buildDiversityPool(names, {
    prefixCap,
    suffixCap,
    firstWords: new Set([...verbs, ...nouns]),
    secondWords: nouns,
  });
}
