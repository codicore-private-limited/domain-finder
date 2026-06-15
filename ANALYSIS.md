# Domain Finder — Pipeline Analysis

## Current Architecture

The miner is a pnpm monorepo (`artifacts/api-server`) running an Express 5 server
with a long-lived background "Hunter" loop.  The high-level flow is:

```
HUNT_POOL (ordered list of genuine names)
      ↓
 buildPhraseBatch()   — names due for a (re)check within the recheck window
      ↓
 scoreCandidate()     — deterministic value scoring (stored, not used as a gate)
      ↓
 dnsAvailabilityBatch() — parallel DNS NXDOMAIN probes
      ↓
 rdapBatch()          — Verisign RDAP authoritative confirm ("RDAP-verified free")
      ↓
 filterLegallyAllowed() — trademark / brand-collision gate
      ↓
 evaluateLocalDiamond() — deterministic strict quality gate (no LLM needed)
      ↓  (only for strong/diamond-grade locals)
 evaluateDiamond()    — LLM (Groq Llama-3) second-opinion judge
      ↓
 discoveriesTable (PostgreSQL)
      ↓  (only confirmed isDiamond=true)
 alertDiamond()       — Telegram notification
```

### Generation strategies (ALL_STRATEGIES in generators.ts)

| Strategy | Description | Typical output |
|---|---|---|
| `one_word_real` | Sweeps full English dictionary shortest-first | `vault`, `ember`, `scout` |
| `four_letter_real` | 4-letter real words only | `peak`, `glow`, `sage` |
| `real_phrase` | Demand-ranked two-word concepts from Google corpus | `realestate`, `setuser` |
| `two_word_real` | Deterministic W1×W2 sweep over curated adj/verb/noun lists | `fastpay`, `cloudvault` |
| `news_driven` | Trending keywords + power suffixes/prefixes | `fusionhub`, `quantumlab` |
| `three_word_real` | Short connector + adjective/verb + noun triples | `getmybook`, `topcodehub` |
| `two_word_brandable` | Premium-feel portmanteau-style fusions | `deepmind`, `novalab` |
| `pronounceable_word` | Real-word bases lightly trimmed/suffixed | `zenith`, `solverix` |
| `brandable_cvcv` | Random CVCV/CVCVC phonetic patterns | `tevo`, `naxul` |
| `future_suffix` | Category prefix + tech suffix | `neuralbit`, `qorenode` |
| `dictionary_hack` | Trend keyword + power word | `fusionai`, `deepcore` |
| `prefix_root` | Premium prefix + root morphed | `metanode`, `omniflux` |
| `transliteration` | Sanskrit/Japanese/Greek root + suffix | `agniify`, `soraly` |
| `portmanteau` | Two trend keywords blended | `neuralink`-style |
| `short_suffix` | Root + short phonetic suffix | `coreax`, `wavelo` |
| `four_letter` | 4-character alphanumeric codes | `a3kz`, `m7nl` |

### The HUNT_POOL (primary sweep target)

The hunter does NOT use generated candidates for its main sweep.  It walks a
pre-built `HUNT_POOL` — a priority-ordered list of **every genuinely sellable
name** the tool should ever probe:

1. Short (≤6 letter) recognizable common words (`peak`, `glow`, `vault`…)
2. Curated modern high-value phrases (`aitools`, `payflow`, `smarthome`…)
3. Full Verb+Noun / Noun+Noun matrix (`setuser`, `getdata`, `paycloud`…)
4. Remaining one-word pool (7-12 letter real words)
5. Demand-ranked corpus phrases

Every name in HUNT_POOL is re-probed at most once per `HUNTER_RECHECK_MS`
(default 10 min), so the miner continuously watches for expirations.

### Scoring (`scoreCandidate` in scoring.ts)

The `valueScore` (0-99) is a **selectivity signal**, not a raw formula:

| Condition | Cap / Penalty |
|---|---|
| Not in `isSellableDomain()` (not a real word or known phrase) | Hard-capped at `max(20, 5 + realWord×0.3)` |
| Contains a weak/generic filler noun (`tab`, `tile`, `ratio`…) | Capped at 65 (two-word) or 75 (single) |
| No clear commercial buyer pool | Capped at 55 |
| Not a recognizable word, real phrase, or high-value category | Capped at 75 |
| Non-`.com` TLD | Capped at 80 |
| Medium trademark risk | `max(40, value - 18)` |
| High trademark risk or negative/adult content | Capped at 20-25 |

### LLM diamond gate (`evaluateDiamond` / `evaluateLocalDiamond`)

Two-stage evaluation:
1. **Local deterministic gate** — always runs; uses the hard caps above.
   Diamond requires: recognizable single word OR known high-value category,
   plus `radioTest=true`, no TM risk, no weak noun, length ≤ 10.
2. **LLM judge (Groq Llama-3)** — fires only when the local gate returns
   `diamond` or `strong_watchlist`.  The LLM prompt explicitly instructs:
   - "Two real words do NOT make a diamond."
   - "Generated combos like linetile, modetab should be DECENT or SKIP."
   - "Most generated domains should score below 60."
   The model's `isDiamond` field is **ignored**; only the numeric `score` is
   used, then cross-checked against deterministic hard caps.

`DIAMOND_THRESHOLD` defaults to 88 and is configurable via env.

---

## Failure Modes Identified & Remediated

### 1. Gibberish CVCV coinages rated 90+

**Root cause**: The old scoring rewarded phonetic patterns (`CVCVC`, radio-test)
independently of real-word content.  A name like `toxih` or `qbitaa` with
a clean phonetic pattern would accumulate enough sub-scores to exceed 90.

**Fix applied**: `scoreCandidate` now **hard-caps any name that is not in
`isSellableDomain()`** (i.e. not a real dictionary word and not a known two-word
phrase) to `max(20, …)`.  Gibberish can never reach the diamond gate.

### 2. Meaningless two-word mashups (`courtheld`, `pastcouple`)

**Root cause**: The `real_phrase` strategy drew from a raw bigram corpus
containing grammar fragments ("still like", "people seem") and fused them.

**Fix applied**:
- `REAL_PHRASES` filters corpus entries: both halves must be content words
  (≥3 letters, in the curated common word set, not in `PHRASE_STOPWORDS`).
- `phraseDemand()` returns the corpus frequency; only phrases with
  `demand ≥ 70` qualify as `isHighValueCategoryPhrase` (diamond eligible).
- `meaningfulSegments()` uses a word-break DP that requires genuine dictionary
  coverage; purely grammatical pairs can't fake a clean split.

### 3. Combinatorial flooding (`lane*`, `mode*`, `vote*`)

**Root cause**: The Verb+Noun matrix (~140 verbs × ~100 nouns = ~14k pairs)
plus Noun+Noun pairs produced hundreds of entries sharing the same first or
second word (e.g. all 100 noun suffixes for "lane", "mode", "vote"…).

**Fix applied**: `VERB_NOUN_POOL` is now built with a **per-stem diversity cap**
(configurable via `DIVERSITY_PREFIX_CAP`, default 25) so no single first-word or
second-word token can dominate the pool.  This reduces the effective pool size
and prevents any one template from flooding the results.

### 4. Inflated scores across the board

**Root cause**: Sub-scores (length, phonetic, memorability, radioTest) were
averaged together, meaning a 5-letter pronounceable word *always* scored ~85+
regardless of whether it had any commercial meaning.

**Fix applied**: `meaningfulValue()` computes value from real-world signals:
- Single recognizable dictionary word: 72 + length bonus → up to 97
- Known real phrase: `50 + demand×0.4` → proportional to corpus frequency
- Arbitrary fused combo: 70 → capped further by the buyer-pool / TM checks

The old sub-scores (length, phonetic, memorability, radioTest) are still
computed and stored for informational purposes but do **not** drive `valueScore`.

### 5. Category labels detached from content

**Root cause**: Category (`ai`, `quantum`, etc.) was assigned by which cycle the
hunter happened to be on, not by whether the name actually contained category
signals.

**Status**: The hunter now injects live trend keywords from news/funding events
per category and the LLM prompt includes category context so the AI judge can
assess relevance.  Further improvement (per-name category validation) is tracked
as future work.

---

## Configuration Reference

All tuneable thresholds are set via environment variables (see `.env.example`):

| Variable | Default | Description |
|---|---|---|
| `DIAMOND_THRESHOLD` | `88` | Minimum score for `isDiamond=true` |
| `HUNTER_BATCH_SIZE` | `5000` | Names probed per hunter cycle |
| `HUNTER_CONCURRENCY` | `800` | Parallel DNS connections |
| `HUNTER_RECHECK_MS` | `600000` | Recheck interval per name (10 min) |
| `DIVERSITY_PREFIX_CAP` | `25` | Max entries per stem in Verb+Noun pool |
| `WEAK_NOUN_MAX_SCORE` | `65` | Score cap for weak-noun two-word combos |
| `MIN_PHRASE_DEMAND` | `0` | Min corpus demand to include a phrase |

---

## Test Coverage

Unit tests live in `artifacts/api-server/src/test/`.  Run with:

```
pnpm --filter @workspace/api-server run test
```

Tests cover:
- **Gibberish rejection**: invented CVCV strings score ≤ 20
- **Weak-pair rejection**: `modetab`, `ratiotube`, `sheetpanel` score ≤ 65
- **Real-word premium**: `vault`, `signal` score in the high-value range
- **High-value phrases**: `paycloud`, `dataflow`, `aitools` recognized
- **Segmentation**: `meaningfulSegments` correctly splits known phrases
- **Diversity cap**: `buildDiversityPool` limits per-stem entries
- **Local diamond gate**: `evaluateLocalDiamond` verdicts match expectations
