# 13 — Does remediation actually work? (outcome metric + fade-out)

**Date:** 2026-07-20
**Question (James):** *"whether focus keys are actually improving (data prior to being
focused vs after being focus) and if those keys are repeatedly becoming focus keys
again, then maybe we're not spending enough time with them."*

## The gap this closes

Through research/11 and /12 the app measured **whether a key is weak** and **how much
exposure it gets** — but nothing anywhere recorded **whether being focused helped**.
Every figure in 11 and 12 describes the intervention, never the result. That made all
tuning (`WEAK_WORD_BOOST`, `FOCUS_REPS_PER_LINE`, `ADAPT_FOCUS_N`) guesswork with no
feedback signal.

## What we built (Decision 13 — Built)

### Focus episodes (schema v4)
An **episode** spans one continuous stretch of a key being a focus key.
`syncFocusEpisodes()` runs once per generated line and diffs the focus set:

```
open : { in: seenCounter, errIn, attemptsIn }        -> state.focusOpen[key]
close: { ..., out: seenCounter, errOut, reps }       -> keys[id].episodes  (last 10)
       keys[id].focusCount += 1                      -> lifetime, never trimmed
```

`Engine.focusOutcomes()` reports per key: `focusCount` (relapses), `improved`
(mean `errIn - errOut`), `meanReps` (attempts delivered per episode), `lastErrOut`.

**The diagnostic value is the COMBINATION** — these two look identical without `reps`:
- **Relapse + HIGH reps** → dose was fine, released too early → widen `FADE_WINDOW`
  or the exit threshold.
- **Relapse + LOW reps** → dose too thin → raise `FOCUS_REPS_PER_LINE`, or lower
  `ADAPT_FOCUS_N` so fewer keys share the line budget.

`focusCount` is separate from `episodes.length` because the episode array is
ring-buffered at `EPISODES_MAX = 10` and a heavy relapser saturates it fast (`z` hit 10
in a single simulated run) — relapse count is the whole point of the metric and must
not cap.

**No back-fill in the v3→v4 migration, deliberately.** Past focus episodes were never
observed; inventing them would poison the only outcome metric the app has. Existing
users start empty and accumulate from their next session.

### Fade-out instead of a cliff
A key that cleared the weak threshold previously dropped straight back to baseline
exposure on the same line. That abrupt withdrawal is a plausible *cause* of relapse —
which would masquerade as "the dose was too small" and invite the wrong fix.

```
FADE_WINDOW     = 1200   // keystrokes of tapering support after leaving focus
FADE_REPS_START = 2      // reps/line immediately after graduating
FADE_REPS_END   = 1      // reps/line at the end of the taper
```
`fadingKeys()` / `fadeReps()` apply a linear taper; `enforceFocusDose` merges these
with the full-dose focus keys.

### Bug fixed in passing
Dose counting missed **capitalised** occurrences (`C` vs `c`), so a line already
containing `Context` counted zero `c` and got a redundant burst spliced in. It
over-delivered rather than under-delivered, so it never showed up in density figures.

## Simulated run (PLUMBING ONLY — not evidence of learning)

500 lines from James's real error profile, with an **invented** learning curve
(error decays ~0.5%/rep):

| key | episodes | mean improved | mean reps | start → last err |
|---|---|---|---|---|
| `z` | 10 (capped) | 4.7pp | 16 | 23% → 6.7% |
| `x` | 8 | 10.0pp | 18 | 16% → 6.7% |
| `v` | 7 | 2.3pp | 13 | 16% → 9.3% |
| `e` | 2 | 1.5pp | **67** | 10% → 9.5% |

**Improvement here is true by construction** — the simulation defines practice as
improving keys. This validates that episodes open, close and record correct values.
It is NOT evidence that remediation works.

Two things it did reveal:
1. **Rare keys relapse constantly on thin doses** (`z`/`x`/`v`: 6–10 episodes at 12–18
   reps) while common keys get 67 reps in 2 episodes. That is the "dose too thin"
   pattern — the first thing to check against real data.
2. **`z` DOES eventually reach focus.** With a static profile focus was stuck at
   `[e, s, c]` (research/12's known gap), but as common keys improve, rare keys become
   relatively worst and get their turn. `impact` ranking *delays* rare keys rather than
   permanently excluding them — a softer problem than research/12 concluded.

## Open / untested

- **No human validation.** The whole point of this metric is that it can only be
  answered by real practice data. Check `Engine.focusOutcomes()` after several sessions.
- `FADE_WINDOW = 1200` and the 2→1 taper are **arbitrary starting values** — unlike the
  constants before them, the instrumentation can now falsify them.
- `ADAPT_FOCUS_N` left at 3 deliberately: changing two levers at once would make the
  new metric uninterpretable.

**Quality tag:** MEASURED for plumbing/verification; the learning curve is SIMULATED and
must not be cited as evidence. Confidence: high that the metric is correct, unknown on
whether remediation works.
