import { isGoodOneWord, isRealPhrase } from "./wordlists";

/**
 * Honest, anti-hype realistic resale valuation.
 *
 * This is deliberately conservative. It does NOT promise crores. It returns a
 * plain-words band so the user avoids spending money on junk. Per repo rules we
 * never surface a fake 0-100 score to the user — only an honest band label.
 *
 * Reality check baked in:
 *  - ~99.3% of good short/medium .com are already taken.
 *  - Brand-new available .com are usually low value ("lottery" only if perfect).
 *  - The real upside comes from EXPIRING good domains and EARLY trend catches.
 */

export type ValueBand =
  | "junk"
  | "low" // ~$10–100
  | "modest" // ~$100–500
  | "solid" // ~$500–2k
  | "strong" // ~$2k–10k
  | "lottery"; // rare upside, mostly a long shot

export interface Valuation {
  band: ValueBand;
  label: string; // human plain-words label (shown to user)
  realisticUsd: string; // honest dollar range string
  notes: string[];
}

const BAND_LABEL: Record<ValueBand, { label: string; usd: string }> = {
  junk: { label: "Not worth buying", usd: "~$0" },
  low: { label: "Low value", usd: "~$10–100" },
  modest: { label: "Modest", usd: "~$100–500" },
  solid: { label: "Solid", usd: "~$500–2,000" },
  strong: { label: "Strong", usd: "~$2,000–10,000" },
  lottery: { label: "Long-shot upside", usd: "rare; usually a long shot" },
};

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

function vowelRatio(name: string): number {
  if (name.length === 0) return 0;
  let v = 0;
  for (const c of name) if (VOWELS.has(c)) v++;
  return v / name.length;
}

export interface ValuationInput {
  name: string; // bare name, no .com
  trendMatch?: boolean; // matches a current hot trend keyword/seed
  expiring?: boolean; // came from the expiring/drop pipeline
}

/**
 * Produce an honest valuation band. Conservative by design.
 */
export function valuate(input: ValuationInput): Valuation {
  const name = input.name.toLowerCase().replace(/[^a-z]/g, "");
  const len = name.length;
  const notes: string[] = [];

  const goodWord = isGoodOneWord(name);
  const realPhrase = isRealPhrase(name);
  const vr = vowelRatio(name);
  const pronounceable = vr >= 0.25 && vr <= 0.65;

  // Base score from intrinsic quality (kept internal, never shown as a number).
  let score = 0;
  if (goodWord) {
    score += 55;
    notes.push("real dictionary word");
    if (len <= 5) score += 25;
    else if (len <= 7) score += 15;
    else if (len <= 9) score += 5;
  } else if (realPhrase) {
    score += 40;
    notes.push("real two-word concept");
    if (len <= 10) score += 10;
  } else {
    // Not a recognized sellable name — junk by repo definition.
    return {
      band: "junk",
      label: BAND_LABEL.junk.label,
      realisticUsd: BAND_LABEL.junk.usd,
      notes: ["not a recognizable word or real phrase"],
    };
  }

  if (!pronounceable) {
    score -= 15;
    notes.push("awkward to pronounce");
  }
  if (input.trendMatch) {
    score += 15;
    notes.push("matches a current trend");
  }
  if (input.expiring) {
    score += 10;
    notes.push("expiring — catchable on drop");
  }

  // Map internal score to honest band. Note: brand-new availability is rare for
  // good names, so when a strong name is actually free we flag the long shot.
  let band: ValueBand;
  if (score >= 85) band = "strong";
  else if (score >= 70) band = "solid";
  else if (score >= 55) band = "modest";
  else band = "low";

  // Honesty guard: a top-tier short word that is genuinely available is almost
  // always either a fluke or has a hidden flaw — call it a long shot, not a sure
  // thing, unless it's an expiring catch (those are real).
  if (band === "strong" && !input.expiring) {
    band = "lottery";
    notes.push("if truly free, treat as a long shot — verify carefully");
  }

  return {
    band,
    label: BAND_LABEL[band].label,
    realisticUsd: BAND_LABEL[band].usd,
    notes,
  };
}
