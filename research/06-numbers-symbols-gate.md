# 06 — Numbers/symbols: a faster, accuracy-focused gate

**Date:** 2026-07-05
**Question:** Should numbers and symbols have to clear the same ~35 WPM / 343 ms
speed gate as letters before graduating?

## Findings
- **Numbers/symbols slow even proficient typists** — the fingers must leave home
  row; the number row is grouped with the genuinely rare letters (Q/X/Z) as the
  universal slow spots.
- **Even good touch-typists "hybrid"**: touch-type letters but *visually hunt*
  numbers/symbols. Letter-level fluency on them is unrealistic.
- **The competency is location + finger-zone recall, not speed.** *"Remember the
  location of symbols on the keyboard — this may seem slow at first but will
  gradually increase your typing speed."* Each finger owns specific numbers (index
  fingers do 4/5 and 6/7, with 5/6 as stretches).

## What this means for us
Holding numbers/symbols to the letter speed gate over-drills low-frequency keys and
stalls the curriculum. **Category-aware gate** (`gateFor()` in `engine.js`):
- **Letters:** unchanged — ≥20 attempts, ≤343 ms, ≥95%.
- **Numbers & symbols:** ≥8 attempts, ≥95%, **speed waived entirely** — mastery is
  pure location/accuracy, so a new key integrates fast and the next comes in quickly.
  (A mastered-but-slow key still gets speed practice via maintenance remediation.)
- **Specials:** speed waived (unchanged).
→ Decision 06 (**Built**).

**Honest limit:** the browser can't report *which finger* was used, so the gate
verifies location (accuracy) + rough speed only. The correct finger is taught via
the on-screen highlight/hint but can't be gated on.

## Sources
- TypeSpeedTest, "Touch Typing vs. Hunt and Peck" (number-row slowdown; hybrid
  typing) — **COMMERCIAL**
- How-to-Type lesson 6 / Ratatype (location + finger-zone learning) — **COMMERCIAL**

## Confidence
**Moderate** — the direction (low-frequency keys need location recall, not fluency;
they're slower for everyone) is well-supported and matches common curricula; the
specific ~600 ms bar is a reasonable, tunable design choice, not a lab value.
