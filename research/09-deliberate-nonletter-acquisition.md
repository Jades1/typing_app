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
An **acquisition ramp** in adaptive mode (`acquisitionRamp()` in `engine.js`),
derived purely from mastery (nothing persisted):
- **A couple at a time:** digits by finger (`4,7 → 5,6 → 3,8 → 2,9 → 1,0`), then
  symbols (comma/period/`'` first), then specials — each set drilled until it clears
  the lenient `gateFor` gate (research/06), then the next slides in. Starts only once
  ≥18/26 letters are mastered (letters solid first).
- **Heavy over-exposure woven into real words:** ~**1 number per 2 letters (≈35% of
  keystrokes)** — >30× natural frequency — as trailing punctuation
  (`house,`), standalone digit chunks (`the 47 house 745 plan`), or interspersed
  special keycaps — while the line stays **~70% real words** (letters keep getting
  practiced via weak-letter word-bias). Not isolated number drills.
- **Resolves the acquisition↔maintenance tension:** the ramp over-exposes
  *un-mastered* keys regardless of `importance`; once a key masters it falls back to
  the normal impact-weighted remediation (bursts only when weak). `importance()` /
  `impact()` / `adaptiveFocus` ranking are **unchanged** — the ramp branches before
  them, and `adaptiveFocus` merely filters out keys the ramp is handling.
- Already-competent users skip the ramp automatically (sticky `mastered` flags).

## Sources
- Builds on research/02 (few-at-a-time acquisition), research/06 (finger zones +
  lenient number/symbol gate), research/08 (impact weighting, explicitly unchanged).
  Product-direction decision grounded in prior findings + the stated user need.

## Confidence
**Strong** on direction (rare-but-needed keys require deliberate over-practice, not
frequency-weighted neglect). The specific density, ramp order, and thresholds are
tunable design choices.
