# 11 — How hard should weak-key remediation actually pull?

**Date:** 2026-07-20
**Question:** When `adaptiveFocus()` names a key as weak, does that measurably change
what the user types — and if not, how hard can we bias before real-word practice
degrades into repeating a word list?

## Finding 1 — "being in focus" was nearly cosmetic (MEASURED, high confidence)

Instrumented `generateLine()` over 1200 adaptive lines, comparing a letter's share of
typed characters when healthy vs. when it was the sole focus key.

| `p` (1.9% baseline English frequency) | share of letters typed |
|---|---|
| healthy, not in focus | 1.65% |
| weak, `focus=[p]` | 2.32% |

**+41% relative — but only +0.67 percentage points, ≈6 extra reps in an 875-keystroke
session.** The focus machinery was correct and stable and still produced almost no
practice. Three compounding dilutions:

1. `WEAK_WORD_BOOST = 1.5`, capped at 2 hits (max 2.25×), applied to *selection
   probability* among eligible words — not a filter.
2. `ADAPT_SENTENCE_P = 0.35` routed ~30% of lines to verbatim corpus sentences, which
   consult focus **not at all**.
3. The 260-word corpus contained only 18 words with `p`, 1 with `j`, **0 with `q`/`z`**.

## Finding 2 — corpus size, not the constant, was the binding limit (MEASURED)

Serving *only* words containing the focus letter caps out around 18–27% density
regardless of corpus size. The difference is how many distinct words deliver it:

| corpus | words containing `p` | practice feel |
|---|---|---|
| 260 | 18 | same handful, obvious loop |
| 2000 | 374 | no perceptible repetition |

So raising the boost on the old corpus would have bought intensity by destroying
variety. **Expanding the corpus first is what makes strong weighting safe.**

## Finding 3 — the strong boost must not leak into the ambient path (MEASURED)

`wordLine()` falls back to "the single weakest letter" whenever no explicit focus set
is passed — and that fallback always names *something*, even when nothing is weak.
Applying the remediation boost there pushed a healthy `p` from 1.65% to **4.01%**,
hammering an arbitrary key for no reason. Fixed by threading the strength: strong
boost only with a real `weakSet`, ambient 1.5 otherwise.

## What we built (Decision 11 — Built)

- Corpus 260 → **2000 words** (`/^[a-z]{1,12}$/`, frequency-ordered, first 260 frozen).
  Per-letter floors enforced; `q` 0→39, `j` 1→39, `p` 18→374.
- `WEAK_WORD_BOOST = 9`, counting **occurrences** rather than presence (`pepper` beats
  `top`), capped at `WEAK_WORD_HIT_CAP = 3`.
- `ADAPT_SENTENCE_P_FOCUS = 0.15` replaces `ADAPT_SENTENCE_P` while a focus set exists.
- `WEAK_WORD_BOOST_AMBIENT = 1.5` preserves the old gentle pull everywhere else.

**Result: a focus letter goes 2.65% → 16.62% of typed characters (+527%, ~6× dose),
with 83% of a session's words still distinct.**

## Relationship to research/07

07 set "≈90% real content, ≤10% drill." That ratio is **superseded** here. 07's actual
target was sequential key-introduction and random-cluster drilling; weighted selection
of *real English words* toward a letter you're weak on is still real content typed for
a purpose. The user made this call explicitly: *"if it's toward a purpose and especially
if those keys are in words, then it isn't a huge issue."* The dilution the ratio was
protecting against turned out to be the thing preventing remediation from working.

## Open

- **Not validated on a human.** All numbers are simulated generation, not measured
  learning. Whether 17% density actually improves a weak key faster than 3% did is
  untested — the plausible failure mode is that heavy targeting feels like a drill and
  costs engagement.
- `WEAK_WORD_BOOST = 9` was chosen to land near the achievable ceiling, not derived
  from learning research. It is the single dial if it wants tuning.

**Quality tag:** MEASURED (in-app instrumentation) for the density/variety numbers;
ANECDOTAL for the intensity target itself. Confidence: high on the diagnosis, medium on
the chosen setting.
