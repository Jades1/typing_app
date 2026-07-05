# 03 — Mastery threshold values (speed + accuracy)

**Date:** 2026-07-05
**Question:** What numeric bar should mark a key as "mastered" and unlock the next?

## Findings
- keybr advances when every unlocked letter reaches "confidence 1," which it
  defines as roughly **≥35 WPM with a low error count** — i.e. **175 chars/min ≈
  ≤343 ms average between keystrokes**, *per key* (not just overall).
- It tracks **speed per key, not just accuracy** — a key typed correctly but slowly
  still gets extra practice, addressing the "accurate but not fluid" plateau.

## What this means for us
Our gate: over a **recent window** (last 30 attempts), a key needs ≥20 attempts,
recent error rate ≤5%, and recent avg latency ≤343 ms (speed waived for special
keys, which emit no latency). Continuous `confidence` in [0,1] equals 1 exactly
when the gate passes. → Decision 03 (Adopted).

## Open questions / caveats
- 343 ms / 35 WPM is **keybr's** number, widely repeated but not independently
  validated as the *optimal* per-key bar. It's a reasonable, defensible default.
- Per-key ≠ flowing speed — real text is typed much faster than the per-key gate,
  because of bigram/word chunking (see topic 05).

## Sources
- keybr.com help + community threads (Google Group; TypingDoneWell guide) — **COMMERCIAL / community** (primary for keybr's specific numbers)

## Confidence
**Moderate** — the value is a sensible, well-known default, but it's a product
design choice, not a lab-derived optimum. Easy to tune later if data suggests.
