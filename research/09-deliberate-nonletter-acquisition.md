# 09 — Deliberate, progressive numbers/symbols/specials acquisition

**Date:** 2026-07-05
**Question:** In adaptive mode, is the light "burst a number when it looks weak"
treatment enough to actually *learn* numbers/symbols/special keys?

## Findings / rationale
- Numbers, symbols, and special keys are **both hard AND rare in natural text**, so
  they barely appear in the real-word content adaptive mode generates. Remediating
  them only when they measure weak under-trains them — you can't get weak-signal on
  a key you almost never type.
- The frequency/impact weighting (research/08) *deliberately deprioritizes* rare
  keys — correct for *maintenance*, wrong for *acquisition*. To learn a rare key you
  must **over-expose** it, against its natural frequency.
- Learning them benefits from a progressive ramp (a couple at a time, build up) —
  same "handful at a time, master before adding more" principle as research/02, and
  the finger-zone grouping from research/06.

## What we built (Decision 09 — Built)
The heavy deliberate drilling lives in the **Beginner-course category levels** —
Numbers (`'4'`), Symbols (`'5'`), Special keys (`'6'`) — each a dedicated round, NOT
in Adaptive (which gets only a light sprinkle). (Corrected after a first pass wrongly
put the ramp into Adaptive.) Per-track density in `RAMP_TRACK`: numbers ~1:2, symbols
high, special keys ~1:4 (they disrupt flow more).

**Each round** (`acquisitionRamp()` in `engine.js`, `RAMP_LEVELS`),
derived purely from stats (nothing persisted):
- **A few at a time, accumulating, fast:** ~**3 digits active at once** (by finger),
  each incorporated as soon as it's typed *accurately* just a **few times**
  (`rampReady`: ≥4 recent attempts, ≥95%, **no speed**) — so new numbers come in
  quickly and several interleave; earlier numbers keep appearing (accumulating
  `introduced` pool, weakness-weighted) so they build speed as new ones arrive.
- **Heavy over-exposure woven into real words:** ~**1 number per 2 letters (≈35% of
  keystrokes)** — e.g. `Room 747 has 747 child 74 think 747` — real words stay the
  carrier (~70%). Not isolated number drills.
- Full mastery (`isMastered`, speed-gated) still accrues in the background; it's just
  not what advances the ramp.

**Adaptive mode** gets a **light sprinkle** only (`sprinkleDigits`, ~1% of
keystrokes) — a few numbers woven into word lines so they're not absent, without
Adaptive becoming number-heavy. `importance()`/`impact()`/`adaptiveFocus` unchanged.

## Sources
- Builds on research/02 (few-at-a-time acquisition), research/06 (finger zones +
  lenient number/symbol gate), research/08 (impact weighting, explicitly unchanged).
  Product-direction decision grounded in prior findings + the stated user need.

## Confidence
**Strong** on direction (rare-but-needed keys require deliberate over-practice, not
frequency-weighted neglect). The specific density, ramp order, and thresholds are
tunable design choices.
