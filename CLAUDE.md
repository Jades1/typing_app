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
  words.js      bundled word/sentence corpus + letter-bitmask filtering (leaf module)
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

**Evidence base:** the research behind every learning-design choice lives in
`research/` (indexed by `research/README.md`, which also holds the decisions ←
evidence table). **Consult it before changing the curriculum, mastery gate, or
practice material**, and log new findings there with a source + quality tag
(`PEER-REVIEWED`/`COMMERCIAL`/`ANECDOTAL`) + confidence. Known open item: real
words/sentences practice is *proposed but not built* (research/05).

**Interleave mastered keys, not un-mastered ones.** Keys are introduced ONE AT A
TIME. The single un-mastered "target" key (`targetKey()`, first un-mastered key in
canonical `STAGES` order) is drilled — interleaved only with keys already mastered
— until it clears a per-key **speed + accuracy** gate, then graduates and the next
key is introduced. Interleaving is the *reward* for mastery, not the method of
acquiring it. Backed by contextual-interference + overlearning research (keybr's
model). Key pieces in `engine.js`:

- **Mastery gate** (`isMastered` via `gateFor(keyId)` — **category-aware**): over a
  **recent window** (last `RECENT_WINDOW` attempts, not lifetime). **Letters:**
  `≥MASTERY_MIN_ATTEMPTS`, `errRate ≤MASTERY_MAX_ERR`, `avgLat ≤TARGET_MS` (≈343 ms
  = 35 WPM). **Numbers/symbols:** lenient — 12 attempts, ≤600 ms (research/06: the
  goal is location + finger recall, not fluency). **Specials:** speed waived (no
  latency). Base constants live in `stats.js`; the per-category thresholds live in
  `gateFor` in `engine.js`.
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
- **Input**: single capturing `keydown` listener in `app.js`. While a session runs,
  `SWALLOW_KEYS` (Tab/space/Enter/Backspace/arrows/Page/Home/End) are
  `preventDefault`ed **up front** — before the token lookup — so they never drive
  the browser (focus move, scroll, back-nav, button activation) even if the current
  token isn't resolved yet. Cmd/Ctrl combos are exempted so shortcuts (Cmd+R) aren't
  trapped. Outside a session, keys pass through normally (so Tab can still reach the
  controls for accessibility).
- **Adaptive mode (DEFAULT, research/07)**: `settings.levelChoice === 'adaptive'`.
  Content-first: full keyboard, no key-introduction order, real words/sentences.
  `adaptiveFocus()` → `{focus, probes}`: `focus` = ≤`ADAPT_FOCUS_N` keys measuring
  weak over the recent window (≥`ADAPT_ERR_WEAK` errors or ≥`ADAPT_LAT_WEAK`× your
  median latency, with ≥`ADAPT_MIN_ATTEMPTS` data); `probes` = under-sampled/stale
  digits+symbols. Focus is ranked by `impact(k) = weakness(k) × importance(k)`
  (`importance` = key usage frequency, research/08) so a weak common key beats a weak
  rare one; `weakest()` (the panel) sorts by `impact` too. `adaptiveLine()` =
  weak-letter-biased `wordLine()` + `sentenceLine`
  + `spliceAtSpace(burstTokens(k))` for a focus/probe key words can't cover (digits,
  symbols, `z`/`q`; `pickBurstKey` cadence). ~90% content, ≤10% drill. Mastery still
  accrues (display/continuity) but does **not** gate. HUD slot shows focus keys, not
  ETA. Summary uses `sessionKeyDeltas()` ("Improved this session"). Not in
  `FLUENCY_MODES` (so `checkProgress` still marks mastery) but in `FULL_POOL_MODES`.
- **Curriculum & levels (Beginner course)**: `STAGES` in `engine.js`.
  `settings.levelChoice` ∈ `'adaptive' | 'auto' | '<stageIndex>' | 'all' | 'words' |
  'sentences'`. A stage (row) is completed only when all its keys are individually
  mastered (`canAdvanceStage`); `maybeAdvanceStage()` advances in `'auto'` and fires
  mid-session via `checkProgress()`. `'all'`/`'words'`/`'sentences'` are **fluency
  modes** (`FLUENCY_MODES`); `FULL_POOL_MODES` adds `'adaptive'` (all = null target,
  full pool).
- **Material level** (`materialLevel()` → `clusters | words | sentences`, research/05):
  a *derived* function of mastery state, **nothing new persisted**. Once all pool
  letters are mastered, the letters backbone of a line renders **real words** (from
  the `js/words.js` corpus, filtered to mastered letters via letter bitmask, then
  weakness-weighted) instead of pseudoword clusters; once `pool.caps` **and** `.`/`,`
  are mastered, `'sentences'` mode serves verbatim corpus sentences. Digit/symbol
  acquisition (targets, slot floors) continues around the word material.
  `checkProgress()` emits `{type:'material'}` on promotion → app.js notifies.
  **Trap:** test `pool.caps`, never `isMastered('Shift')` (Shift is never gated).
  **Explicit vs auto:** the *automatic* progression gates words/sentences on mastery
  (via `masteredLetterSet()` / `requireMastery`). But **manually selecting** the
  `'words'`/`'sentences'` level is PERMISSIVE — `fluencyLetterSet()` uses the whole
  alphabet and `sentenceLine(false)` skips the mastery check, so picking a fluency
  mode always shows real words/sentences (never a cluster fallback). The user chose
  it; adaptivity (weakness weighting) still applies.
- **Finger toggle**: `settings.showFingers` (home-screen checkbox) toggles
  `body.no-fingers`, which hides `#finger-hint`. Key colour tints stay on.
- **Session feedback**: `showSummary()` (`app.js`) surfaces progress from data
  already stored — `Stats.sessionComparison()` (this session vs. mean of prior ≤5;
  `hasHistory`/`wpmDelta`/`accDelta`/`isBestWpm`), `Engine.keysMasteredThisSession()`
  (via a `trackingStartCounter` snapshot in `startTracking()`, strict `>`),
  `Engine.masteryProgress()`, and `Engine.weakest()`. `Engine.masteredKeys()` feeds
  the side-panel "Keys mastered" card. No new persistence.

## Data model (`localStorage`)

Key `typing_app_v1`; `version: 3`. Migrations in `stats.js migrate()`: v1→v2 adds
`recent[]` + seeds `mastered` from lifetime stats; v2→v3 makes `'adaptive'` the
default (flips only barely-started `'auto'` users; adds `adaptiveNoticeShown`).
Per-key `recent` is a ring buffer (max `RECENT_WINDOW`): `>0` = correct latency ms,
`0` = correct w/o latency (specials), `-1` = error.

`{ version:3, seenCounter,
   keys:{ id:{attempts,errors,sumLatencyMs,samples,lastSeen, recent:[…], mastered, masteredAt} },
   sessions:[{date,ts,durationMs,chars,correct,attempts,errors,wpm,accuracy}],
   settings:{ sessionMinutes, stage, levelChoice, strictMode, theme, dailyGoalMinutes, showFingers, adaptiveNoticeShown } }`

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
