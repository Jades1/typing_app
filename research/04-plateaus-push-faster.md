# 04 — Breaking plateaus: push faster than comfortable

**Date:** 2026-07-05
**Question:** How do typists get *unstuck* once they're accurate but not getting
faster?

## Findings
- Plateaus occur in the "associative phase" — you know what to do but haven't
  automated it at higher speeds.
- The efficient remedy: **deliberately type ~10–15% faster than feels
  comfortable, tolerating more errors.** In a noted experiment, typists were shown
  words 10–15% faster than their fingers could keep up, which pulled them off the
  plateau.
- This is classic deliberate practice — working at the edge of current ability,
  not repeating what's already easy.

## What we built (Decision 04 — Built)
**"Push mode"** — a home-screen toggle. When on, a visual **pace marker** sweeps
through the current line at a **target WPM = your recent-average × 1.15** (floored
at 20 so beginners aren't chasing an impossible number); you try to stay ahead of
it. The catch is deliberately non-punishing (amber flash + rebase just behind you,
no line reset) so it creates pressure without frustration, and **strict mode
auto-relaxes** while pushing (speed over perfection — the point of the technique).
The pacer starts on the first keystroke of each line (reading time isn't penalized).
Pairs with everything else — it paces whatever content you're practicing.

## Sources
- Ericsson et al., deliberate-practice account of typing proficiency (TU Darmstadt
  preprint) — **PEER-REVIEWED** (preprint of peer-reviewed work)
- "How to Break a Typing Speed Plateau" (typingtest.now) — **COMMERCIAL** (secondary summary)

## Confidence
**Moderate–strong** — deliberate practice (work just beyond current ability) is
well-established; the specific "10–15% faster" figure is a practitioner heuristic
consistent with it, not a precise constant.
