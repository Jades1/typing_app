# 12 — Guaranteed exposure: dose by count, not by score-boosting

**Date:** 2026-07-20
**Question:** Focus keys were being *identified* correctly but barely *practiced*.
How do we make remediation actually change what the user types — reliably, for every
key, including ones English words can't supply?

## Why score-boosting failed (MEASURED)

Research/11 raised `WEAK_WORD_BOOST` to 9 (counting occurrences) and got a focus
letter from 2.65% → 16.62%. That looked like success, but it only worked for letters
the corpus can serve. Measuring each letter as the **sole** focus key:

| letter | corpus coverage | max density via words |
|---|---|---|
| `e` | 58% | 30.4% |
| `s` | 24% | 14.3% |
| `c` | 20% | 14.0% |
| `v` | 8% | **4.7%** |
| `x` | 2% | **2.0%** |
| `j` | 2% | **1.6%** |
| `q` | 2% | **1.4%** |
| `z` | 2% | **0.18%** |

**Rare letters are unreachable at ANY multiplier** — only ~2% of corpus words contain
them, so no reweighting of word *selection* can deliver a dose. Worse, a 9× boost
(`9^hits`, up to 729×) completely swamped every other term in `scoreWord`, making the
base priority term irrelevant (verified: switching the base from `weakness` to
`impact` moved densities by <1pp — a measurable no-op).

Diagnosis: exposure was an *emergent side effect* of word scoring. Nobody ever stated
a target, so it could only be tuned by guessing and re-measuring.

## What we built (Decision 12 — Built)

Exposure is now a **stated, enforced quantity**:

- `FOCUS_REPS_PER_LINE = 3` — every focus key appears ≥3× per word line. Words supply
  what they can; the shortfall is spliced in via `focusBurst(key, n)`, which
  interleaves companions so the dose is spaced, not massed (research/01).
- `COVERAGE_MAX_GAP = 400` — the stalest **letter** is forced into a line once unseen
  that long, so no key can silently drop out of rotation and become unmeasurable.
- `WEAK_WORD_BOOST` dropped back to **1.5** (ambient). With count guaranteed, a large
  multiplier is redundant and distorts word choice.

**Verified:** 32/32 focus-key checks met ≥3 per word line; worst letter gaps `z` 692,
`x` 617, `j` 590, `q` 559 keystrokes; no letter ever unshown across 600 lines.

### Why coverage is letters-only

One forced key per line is a scarce slot. Across all ~102 pool keys a full rotation
takes ~3300 keystrokes, so a symbol would need ~30 sessions to reach
`ADAPT_MIN_ATTEMPTS` — **visible but never measurable**, which defeats the purpose.
Restricted to a–z the rotation is ~830 keystrokes (~1 session). Digits/symbols are
better served by the existing `pickBurstKey` probe path (3 instances at a time) and by
the deliberate Numbers/Symbols rounds (research/09).

## KNOWN UNFIXED — the original complaint is only half solved

**A key can still be your worst and never enter focus.** With James's real profile
(`z` 23%, `v` 16%, `x` 16%, `c` 15%, `e` 10%), `adaptiveFocus()` returns **`[e, s, c]`**
— none of the top three. Cause: `impact = weakness × importance` (research/08), where
importance is raw English letter frequency, so `z` (0.074) is multiplied into
irrelevance no matter how badly it is typed. `s` enters on the *slow* criterion at 8%
error while `z` at 23% does not.

The dose guarantee makes focus keys well-practiced. It does **not** fix which keys get
chosen. `z` currently gets only the coverage floor (~1 per 692 keystrokes).

Secondary: `focusWindow('z') = 15` (the clamp floor), so one keystroke swings `z`
between 6.7% and 13.3% error — rare keys are also measured unreliably.

## ALTERNATIVE PATHS — if the current approach doesn't work

Ordered by what to try first. Each is independent.

### A. Fix focus SELECTION (most likely needed — addresses the known gap above)
1. **Dampen importance**: rank by `weakness × sqrt(importance)`. `z`'s multiplier goes
   0.074 → 0.27, `x` 0.15 → 0.39, while `e` stays high (12.7 → 3.56). Keeps
   research/08's principle without letting a 170× frequency gap erase a 2× error gap.
   *Least disruptive; recommended first move.*
2. **Reserve a slot**: keep impact ranking for 2 of 3 focus slots, always give the
   third to the highest raw error rate. Guarantees the worst key is always worked on.
   Cost: a key you rarely type can permanently hold a third of the budget.
3. **Rank by error rate alone**: drop importance from selection entirely. Simplest,
   most directly matches "fix what I'm bad at". Cost: abandons research/08 — you could
   spend a session on `z`+`q` (~0.17% of real typing) while a 10% error on `e` costs
   far more.

### B. User-defined importance (James's idea, NOT YET BUILT)
Let the user mark keys as exempt from frequency-based importance, or assign their own.
Rationale: importance is derived from *English prose* frequency, which is the wrong
reference class for a coder who types `.` `[` `;` constantly. Shapes considered:
- **Exempt list** (recommended) — mark keys "always treated as important". Binary,
  minimal, no numbers to invent. Fixes both `z` and `[`.
- **Custom values** — assign per-key weights. More expressive, more to maintain.
- **Profile presets** — a "Coder" importance table, hand-editable.
Open: whether this lives in the settings UI or as a localStorage-only setting.

### C. Tuning the dose (if intensity is wrong rather than targeting)
- `FOCUS_REPS_PER_LINE` 3 → higher for more intensity, lower for more natural text.
- `COVERAGE_MAX_GAP` 400 → lower for fresher stats, at the cost of more interruption.
- Extend the dose to **sentence lines**: currently sentences are served verbatim and
  carry no dose (~15% of lines), so "guaranteed" means "guaranteed on word lines".
  Enforcing there makes it literal but corrupts the fluency content.
- Coverage across **all 102 keys** instead of letters-only (rejected above; ~3300
  keystroke rotation) if consistency matters more than measurability.

## Open / untested

- **No human validation.** Every number is simulated generation, not measured
  learning. Whether a guaranteed 3-per-line dose improves a weak key faster than the
  old ~0.5-per-line is unknown. Plausible failure: it reads as a drill and costs
  engagement.
- `FOCUS_REPS_PER_LINE = 3` and `COVERAGE_MAX_GAP = 400` were chosen by James as
  starting values, not derived.

**Quality tag:** MEASURED (in-app instrumentation) for all density/gap figures;
ANECDOTAL for the chosen intensity. Confidence: high on diagnosis, medium on settings.
