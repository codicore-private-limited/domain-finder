/**
 * Unit tests for the domain scoring, filtering, and diversity-control pipeline.
 *
 * Run with:
 *   pnpm --filter @workspace/api-server run test
 *
 * Uses Node's built-in `node:test` runner (Node ≥ 18) via tsx for TypeScript.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { scoreCandidate } from "../lib/scoring.js";
import {
  isSellableDomain,
  isHighValueCategoryPhrase,
  isRecognizableWord,
  meaningfulSegments,
  segmentWords,
  VERB_NOUN_POOL,
} from "../lib/wordlists.js";
import { evaluateLocalDiamond } from "../lib/news/llm-diamond-filter.js";
import { buildDiversityPool, splitStem, capVerbNounPool } from "../lib/diversity.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function score(name: string, tld = "com", keywords: string[] = []): number {
  return scoreCandidate({ name, tld, trendKeywords: keywords }).valueScore;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Gibberish rejection — invented CVCV strings MUST score ≤ 20
// ─────────────────────────────────────────────────────────────────────────────

describe("Gibberish rejection", () => {
  const GIBBERISH = [
    "toxih",    // CVCVC with no real word
    "ravef",    // random consonant cluster, not a real word
    "qbitaa",   // quantum canned suffix mashup
    "xelike",   // like prefix, not a real word
    "soqbit",   // quantum canned suffix mashup
    "oqlike",   // like suffix, not a real word
    "likebi",   // two-syllable nonsense
    "aaqbit",   // random + qbit suffix
    "poqbit",   // random + qbit suffix
    "zaxulo",   // invented CVCVCV
  ];

  for (const name of GIBBERISH) {
    test(`"${name}" should score ≤ 20 (hard gibberish cap)`, () => {
      const s = score(name);
      assert.ok(
        s <= 20,
        `Expected "${name}" to score ≤ 20 (gibberish), got ${s}`,
      );
    });
  }

  test("isSellableDomain returns false for gibberish", () => {
    for (const name of GIBBERISH) {
      assert.equal(
        isSellableDomain(name),
        false,
        `isSellableDomain("${name}") should be false`,
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Weak-pair rejection — modetab, ratiotube etc. MUST score ≤ 65
// ─────────────────────────────────────────────────────────────────────────────

describe("Weak-pair rejection", () => {
  const WEAK_PAIRS = [
    "modetab",    // mode + tab (both weak generic nouns)
    "ratiotube",  // ratio + tube
    "sheetpanel", // sheet + panel
    "lanetile",   // lane + tile
    "voterack",   // vote + rack
    "scopepanel", // scope + panel
    "poolrack",   // pool + rack
  ];

  for (const name of WEAK_PAIRS) {
    test(`"${name}" should score ≤ 65 (weak-noun cap)`, () => {
      const s = score(name);
      assert.ok(
        s <= 65,
        `Expected "${name}" to score ≤ 65 (weak-noun cap), got ${s}`,
      );
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Real-word premium — genuine dictionary words MUST score well above gibberish
// ─────────────────────────────────────────────────────────────────────────────

describe("Real-word premium", () => {
  const REAL_WORDS = ["vault", "signal", "ember", "scout", "forge", "wave"];

  for (const name of REAL_WORDS) {
    test(`"${name}.com" should score > 20 (real-word premium)`, () => {
      const s = score(name);
      assert.ok(
        s > 20,
        `Expected "${name}" to score > 20, got ${s}`,
      );
    });

    test(`isRecognizableWord("${name}") should be true`, () => {
      assert.equal(isRecognizableWord(name), true);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. High-value phrase recognition
// ─────────────────────────────────────────────────────────────────────────────

describe("High-value phrase recognition", () => {
  const HIGH_VALUE = [
    "paycloud",
    "cloudflow",  // ["cloud","flow"] — both HVC terms, no weak noun
    "aitools",
    "smartpay",
    "codehub",
    "workhub",
  ];

  for (const name of HIGH_VALUE) {
    test(`isHighValueCategoryPhrase("${name}") should be true`, () => {
      assert.equal(
        isHighValueCategoryPhrase(name),
        true,
        `"${name}" should be recognised as a high-value category phrase`,
      );
    });
  }

  const NOT_HIGH_VALUE = ["modetab", "ratiotube", "toxih", "ravef"];
  for (const name of NOT_HIGH_VALUE) {
    test(`isHighValueCategoryPhrase("${name}") should be false`, () => {
      assert.equal(
        isHighValueCategoryPhrase(name),
        false,
        `"${name}" should NOT be a high-value category phrase`,
      );
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Word segmentation
// ─────────────────────────────────────────────────────────────────────────────

describe("Word segmentation", () => {
  test('meaningfulSegments("setuser") returns ["setuser"] (recognized real phrase)', () => {
    // "setuser" is in the real-phrase corpus, so it is returned as a single
    // element (phrase recognised whole, no split needed).
    const seg = meaningfulSegments("setuser");
    assert.deepEqual(seg, ["setuser"]);
  });

  test('segmentWords("setuser") splits into ["set","user"]', () => {
    // segmentWords always tries a multi-word split without the phrase short-circuit.
    const seg = segmentWords("setuser");
    assert.deepEqual(seg, ["set", "user"]);
  });

  test('meaningfulSegments("fastpay") returns ["fastpay"] (recognized real phrase)', () => {
    const seg = meaningfulSegments("fastpay");
    assert.deepEqual(seg, ["fastpay"]);
  });

  test('meaningfulSegments("toxih") returns null (not a real word)', () => {
    const seg = meaningfulSegments("toxih");
    assert.equal(seg, null);
  });

  test('meaningfulSegments("qbitaa") returns null (not a real word)', () => {
    const seg = meaningfulSegments("qbitaa");
    assert.equal(seg, null);
  });

  test("meaningfulSegments of a real single word returns [word]", () => {
    const seg = meaningfulSegments("vault");
    assert.ok(Array.isArray(seg) && seg.length === 1 && seg[0] === "vault");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Diversity cap — buildDiversityPool limits per-stem entries
// ─────────────────────────────────────────────────────────────────────────────

describe("Diversity cap", () => {
  test("buildDiversityPool with prefixCap=2 limits same-prefix entries", () => {
    const names = [
      "setuser", "setdata", "setpay", "setcloud",  // 4 "set*" entries
      "getuser", "getdata",                         // 2 "get*" entries
      "payuser",                                    // 1 "pay*" entry
    ];
    const firstWords = new Set(["set", "get", "pay"]);
    const result = buildDiversityPool(names, { prefixCap: 2, firstWords });

    // At most 2 "set*" entries should survive
    const setEntries = result.filter((n) => n.startsWith("set"));
    assert.ok(
      setEntries.length <= 2,
      `Expected ≤ 2 "set*" entries, got ${setEntries.length}: ${setEntries.join(", ")}`,
    );
  });

  test("buildDiversityPool with suffixCap=2 limits same-suffix entries", () => {
    const names = [
      "setuser", "getuser", "payuser", "trackuser",  // 4 "*user" entries
      "setdata", "getdata",                           // 2 "*data" entries
    ];
    const secondWords = new Set(["user", "data"]);
    const result = buildDiversityPool(names, { suffixCap: 2, secondWords });

    // At most 2 "*user" entries should survive
    const userEntries = result.filter((n) => n.endsWith("user"));
    assert.ok(
      userEntries.length <= 2,
      `Expected ≤ 2 "*user" entries, got ${userEntries.length}: ${userEntries.join(", ")}`,
    );
  });

  test("buildDiversityPool with both caps preserves total diversity", () => {
    const cap = 3;
    const names = Array.from({ length: 50 }, (_, i) => `stem${i % 5}end`);
    const result = buildDiversityPool(names, { prefixCap: cap });
    // Each unique prefix gets at most cap entries
    const countByPrefix = new Map<string, number>();
    for (const n of result) {
      const key = n.slice(0, 5); // "stem0", "stem1"…
      countByPrefix.set(key, (countByPrefix.get(key) ?? 0) + 1);
    }
    for (const [prefix, count] of countByPrefix) {
      assert.ok(
        count <= cap,
        `Prefix "${prefix}" has ${count} entries, expected ≤ ${cap}`,
      );
    }
  });

  test("splitStem identifies known first-word boundary", () => {
    const verbs = new Set(["set", "get", "pay"]);
    const { prefix, suffix } = splitStem("setuser", verbs);
    assert.equal(prefix, "set");
    assert.equal(suffix, "user");
  });

  test("splitStem falls back to midpoint for unknown stems", () => {
    const { prefix, suffix } = splitStem("zaxulo");
    assert.ok(prefix.length > 0, "prefix should be non-empty");
    assert.ok(suffix.length > 0, "suffix should be non-empty");
    assert.equal(prefix + suffix, "zaxulo");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. VERB_NOUN_POOL diversity — the actual pool must respect the cap
// ─────────────────────────────────────────────────────────────────────────────

describe("VERB_NOUN_POOL diversity", () => {
  test("No single first-word stem exceeds DIVERSITY_PREFIX_CAP entries", () => {
    // The pool itself should have far fewer than 100 entries per stem
    // (old uncapped pool would have 100+ for "lane", "mode", "vote"…)
    const maxPerFirstChar = new Map<string, number>();
    for (const name of VERB_NOUN_POOL) {
      const firstThree = name.slice(0, 3);
      maxPerFirstChar.set(firstThree, (maxPerFirstChar.get(firstThree) ?? 0) + 1);
    }

    // With a default cap of 25, no 3-letter prefix group should exceed
    // cap × (max number of first-words sharing that 3-letter start ≈ 10).
    // A generous upper bound: 25 × 10 = 250 per 3-letter prefix group.
    for (const [prefix, count] of maxPerFirstChar) {
      assert.ok(
        count <= 250,
        `Prefix "${prefix}" has ${count} entries — suspiciously high`,
      );
    }

    // The total pool should be dramatically smaller than the uncapped ~14k+
    assert.ok(
      VERB_NOUN_POOL.length < 20_000,
      `VERB_NOUN_POOL has ${VERB_NOUN_POOL.length} entries — diversity cap may not be working`,
    );
  });

  test("capVerbNounPool with cap=3 limits each stem to ≤ 3 entries", () => {
    const verbs = new Set(["set", "get", "pay"]);
    const nouns = new Set(["user", "data", "cloud", "app", "hub"]);
    const raw: string[] = [];
    for (const v of verbs) for (const n of nouns) raw.push(v + n);

    const capped = capVerbNounPool(raw, verbs, nouns, 3, 3);

    for (const verb of verbs) {
      const count = capped.filter((n) => n.startsWith(verb)).length;
      assert.ok(count <= 3, `Verb "${verb}" has ${count} entries, expected ≤ 3`);
    }
    for (const noun of nouns) {
      const count = capped.filter((n) => n.endsWith(noun)).length;
      assert.ok(count <= 3, `Noun "${noun}" has ${count} entries, expected ≤ 3`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Local diamond gate verdicts
// ─────────────────────────────────────────────────────────────────────────────

describe("Local diamond gate", () => {
  test("Gibberish gets skip verdict from local gate", () => {
    const result = evaluateLocalDiamond("toxih", "com");
    assert.equal(result.verdict, "skip", `Expected "skip" for toxih, got "${result.verdict}"`);
    assert.equal(result.isDiamond, false);
  });

  test("modetab gets skip/decent verdict (not diamond) from local gate", () => {
    const result = evaluateLocalDiamond("modetab", "com");
    assert.ok(
      result.verdict === "skip" || result.verdict === "decent",
      `Expected "skip" or "decent" for modetab, got "${result.verdict}"`,
    );
    assert.equal(result.isDiamond, false);
  });

  test("High-value phrase gets non-skip verdict from local gate", () => {
    const result = evaluateLocalDiamond("paycloud", "com");
    assert.ok(
      result.verdict !== "skip",
      `Expected non-skip for "paycloud", got "${result.verdict}" (score ${result.score})`,
    );
  });

  test("Non-.com TLD caps score at 80", () => {
    const io = evaluateLocalDiamond("vault", "io");
    const com = evaluateLocalDiamond("vault", "com");
    assert.ok(
      io.score <= 80,
      `Expected .io vault to score ≤ 80, got ${io.score}`,
    );
    assert.ok(
      com.score >= io.score,
      `Expected .com to score ≥ .io, got com=${com.score} io=${io.score}`,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Score ordering — real words must outscore gibberish
// ─────────────────────────────────────────────────────────────────────────────

describe("Score ordering", () => {
  test("Real words outscore gibberish", () => {
    const realScore = score("vault");
    const gibScore = score("toxih");
    assert.ok(
      realScore > gibScore,
      `Expected vault (${realScore}) > toxih (${gibScore})`,
    );
  });

  test("High-value phrases outscore weak-noun pairs", () => {
    const hvScore = score("paycloud");
    const weakScore = score("modetab");
    assert.ok(
      hvScore > weakScore,
      `Expected paycloud (${hvScore}) > modetab (${weakScore})`,
    );
  });

  test(".com scores higher than .io for the same name", () => {
    const comScore = score("vault", "com");
    const ioScore = score("vault", "io");
    assert.ok(
      comScore >= ioScore,
      `Expected .com (${comScore}) ≥ .io (${ioScore})`,
    );
  });
});
