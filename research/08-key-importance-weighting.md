# 08 — Weight what-to-work-on by key usage frequency (impact)

**Date:** 2026-07-05
**Question:** When ranking which weak keys to drill, should all keys count equally?

## Findings / rationale
- Ranking purely by weakness (error + latency) ignores that keys differ enormously
  in **how often they're used**. A weak `$` (rare) is far less worth fixing than a
  slightly-weak `p` (common) — improving a common key pays off across almost all
  real typing; improving a rare one barely moves the needle.
- The right ranking metric is **impact = weakness × usage frequency**, not weakness
  alone. This is standard practice for prioritizing practice by expected payoff.
- English **letter frequencies** are well established (e-t-a-o-i-n-s-h-r-d… heavy;
  j-x-q-z negligible). Commas and periods are among the most frequent characters in
  prose; most other symbols are rare.

## What we built (Decision 08 — Built)
`importance(keyId)` in `engine.js`: English letter-frequency table for letters,
comma/period weighted like common letters, other punctuation/specials low, "other"
symbols (`$ # @ % [] {}`) lowest. `impact(keyId) = weakness(keyId) × importance(keyId)`.
Applied to **what-to-work-on** ranking:
- `adaptiveFocus()` ranks the ≤3 focus keys by `impact`, so a common mildly-weak key
  beats a rare severely-weak one (a rare key only gets focus when nothing more
  impactful is weak).
- `weakest()` (the "Keys to focus on" panel + summary "Work on") sorts by `impact`.
Left unchanged: the raw `weakness()` still drives the *mechanics* once a key is
chosen (word-bias strength, slot pressure) — importance is a *prioritization* layer.

## Deferred (user will decide later)
A **manual pin** — let the user force one or two specific keys (e.g. `(` for coders)
into the drill regardless of frequency/weakness. Proposed, not built.

## Sources
- Standard English letter-frequency data (widely published; e.g. Cornell/Lewand
  ordering) — **ANECDOTAL/common-knowledge** (not a controlled study, but
  uncontroversial and stable).

## Confidence
**Strong** on direction (prioritize by impact, not raw weakness — obviously right).
The exact importance values (esp. digits/symbols) are tunable design choices.
