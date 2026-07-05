# typing_app — project notes for Claude

Browser-based adaptive typing trainer. Vanilla HTML/CSS/JS ES modules, **no build
step, no dependencies**. Everything runs client-side; progress lives in
`localStorage` under the key `typing_app_v1`.

## Layout

```
index.html      page structure (topbar, prompt, keyboard, panel, summary modal)
styles.css      theme-aware styling (light/dark/auto), keyboard + finger colours
js/
  fingers.js    key -> finger map (Mac QWERTY), finger metadata/colours, shift helpers
  stats.js      per-key stats (incl. recent-window buffer + mastery flags), gate
                constants, WPM/accuracy, session history, streaks, localStorage + migration
  engine.js     mastery gate, one-at-a-time target, drill pool, forced-target sampler,
                stage curriculum, line generator, progression events + next-key ETA
  keyboard.js   render on-screen keyboard, highlight next key + finger, per-key mastery fill
  notify.js     transient in-session banner (new key / level up), queued
  session.js    countdown timer, live HUD metrics, end-of-session summary
  app.js        wire-up: keydown handling, practice loop, notifications, ETA, settings, panel
```

## Learning doctrine (the core mechanic — read this first)

**Interleave mastered keys, not un-mastered ones.** Keys are introduced ONE AT A
TIME. The single un-mastered "target" key (`targetKey()`, first un-mastered key in
canonical `STAGES` order) is drilled — interleaved only with keys already mastered
— until it clears a per-key **speed + accuracy** gate, then graduates and the next
key is introduced. Interleaving is the *reward* for mastery, not the method of
acquiring it. Backed by contextual-interference + overlearning research (keybr's
model). Key pieces in `engine.js`:

- **Mastery gate** (`isMastered`): over a **recent window** (last `RECENT_WINDOW`
  attempts, not lifetime) a key needs `≥MASTERY_MIN_ATTEMPTS`, recent `errRate
  ≤MASTERY_MAX_ERR`, and recent `avgLat ≤TARGET_MS` (≈343 ms = 35 WPM). **Speed is
  waived for special keys** (they emit no latency). Constants live in `stats.js`
  (single source; engine reads them via `Stats.*`).
- **Sticky mastery**: once graduated a key stays graduated (`markMastered`, a
  persisted flag). A later slip is handled by ordinary weakness re-emphasis in the
  rotation — it does **not** re-become the target, so the curriculum never stalls.
- **Forced-target sampler**: `makeSampler(keys, focus, target)` picks the target
  ~`TARGET_PICK_P` of the time but never twice running — spaced concentration
  (overlearning), bypassing the recent-penalty that would otherwise rotate away.
- **Drill pool**: `drillPool()` = mastered eligible keys ∪ {target}, with a
  cold-start runway up to `MIN_DRILL`. `'all'` mode has no target → legacy
  weakness-weighted `activePool()` (classic mixed review).
- **Progression + ETA**: `checkProgress()` (called per line from `app.js nextLine`
  while a session runs) marks graduations, advances stages, and returns
  `mastered`/`levelUp`/`newTarget` events for notifications. `nextKeyEta()` is a
  deliberately coarse "time to next key" estimate (remaining reps ÷ measured pace,
  EMA-smoothed) — the UI quantizes it, never shows decimals.

- **Underlying levers** (still present, now *beneath* the target model): *weakness
  weighting* (`weakness()`: error rate + latency vs. baseline + recency + intro
  bonus) and a *breadth/rotation rule* (decaying recently-used penalty +
  no-immediate-repeat) that spread the interleave base across mastered keys.

## Key design points
- **Token model**: `generateLine()` returns tokens `{type:'char'|'special'|'space',
  display, expected, keyId, needsShift, shiftSide}`. Letters form clusters;
  numbers/symbols are standalone; specials (Tab/Shift/Control/Alt/Meta) are prompts.
- **Special keys**: resolved on their `keydown` (they emit no character). `e.key`
  is exactly `Tab|Shift|Control|Alt|Meta`. Capitals/symbols need Shift on the
  opposite hand (`whichShift`).
- **Input**: single capturing `keydown` listener in `app.js`; `preventDefault` for
  Tab/space/handled chars, but Cmd/Ctrl combos are let through so browser shortcuts
  (Cmd+R etc.) aren't trapped.
- **Curriculum & levels**: `STAGES` in `engine.js`. `settings.levelChoice` is
  `'auto' | '<stageIndex>' | 'all'`. A stage (row) is completed only when all its
  keys are individually mastered (`canAdvanceStage` = `keys.every(isMastered)`);
  `maybeAdvanceStage()` advances in `'auto'` and now fires mid-session via
  `checkProgress()`. A specific level masters that stage's keys one at a time on
  top of earlier stages. `'all'` = full pool, no target.
- **Finger toggle**: `settings.showFingers` (home-screen checkbox) toggles
  `body.no-fingers`, which hides `#finger-hint`. Key colour tints stay on.
- **Session feedback**: `showSummary()` (`app.js`) surfaces progress from data
  already stored — `Stats.sessionComparison()` (this session vs. mean of prior ≤5;
  `hasHistory`/`wpmDelta`/`accDelta`/`isBestWpm`), `Engine.keysMasteredThisSession()`
  (via a `trackingStartCounter` snapshot in `startTracking()`, strict `>`),
  `Engine.masteryProgress()`, and `Engine.weakest()`. `Engine.masteredKeys()` feeds
  the side-panel "Keys mastered" card. No new persistence.

## Data model (`localStorage`)

Key `typing_app_v1`; `version: 2` (v1 blobs are migrated in `stats.js load()` —
`recent[]` added, `mastered` seeded from lifetime stats so returning users aren't
reset). Per-key `recent` is a ring buffer (max `RECENT_WINDOW`): `>0` = correct
latency ms, `0` = correct w/o latency (specials), `-1` = error.

`{ version:2, seenCounter,
   keys:{ id:{attempts,errors,sumLatencyMs,samples,lastSeen, recent:[…], mastered, masteredAt} },
   sessions:[{date,ts,durationMs,chars,correct,attempts,errors,wpm,accuracy}],
   settings:{ sessionMinutes, stage, levelChoice, strictMode, theme, dailyGoalMinutes, showFingers } }`

## Testing / running

Open `index.html` or `python3 -m http.server` in this folder. Headless engine
smoke tests (target selection, the speed+accuracy gate, graduation, migration)
can be driven by importing `engine.js`/`stats.js` in Node with a `localStorage`
stub — see the scratchpad harnesses used during the mastery-model build. To verify
by hand: type the target key accurately but *slowly* (it must not graduate), then
fast (it graduates, a notification fires, the next key becomes the target).

## Deploy

Intended for GitHub Pages (static, deploy from `main` root) — not yet set up. See
the parent `Projects/CLAUDE.md` for the Pages build-vs-deploy and cache-busting
gotchas before deploying.
