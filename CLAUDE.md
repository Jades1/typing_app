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
  words.js      bundled word/sentence corpus + letter-bitmask filtering (imports literary.js)
  literary.js   ~240 interesting literary sentences (leaf) — merged into words.SENTENCES
  shortcuts.js  Mac-shortcut corpus (25) + combo matching + MC scheduling (imports stats.js)
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
  = 35 WPM). **Numbers/symbols:** lenient — 12 attempts, ≤600 ms, ≥95% (research/06). (The
  *Numbers round* advances its ramp faster via a separate accuracy-only `rampReady`
  check; this global gate is unchanged.) **Specials:** speed waived (no
  latency). Base constants live in `stats.js`; the per-category thresholds live in
  `gateFor` in `engine.js`.
- **Two evidence spans, one buffer** (the churn fix): `recent[]` stores up to
  `RECENT_MAX` (200), but `recentStats(keyId, n = RECENT_WINDOW)` reads back only the
  last `n` — so each consumer picks its own span.
  **`RECENT_WINDOW` is a count of ATTEMPTS, not a span of time**, and letter frequency
  varies ~180×: at 30 attempts `e` was judged on ~80 seconds of typing while `z` was
  judged on ~50 sessions. That mismatch is why adaptive focus keys churned. So
  `adaptiveFocus()` — and *only* it — reads `focusWindow(id)`, which scales the span by
  `importance()` to ≈`FOCUS_SESSIONS` (5) sessions, clamped `[15, RECENT_MAX]` (the
  floor must exceed `ADAPT_MIN_ATTEMPTS`; the extremes can't be evened out without
  unbounded memory). Measured effect: focus-set changes over ~5 simulated sessions
  dropped 11 → 5.
  **Trap:** `recentStats()` defaults to the *mastery* span. The gate,
  `nextKeyEta`, `rampReady`, and `sessionKeyDeltas` are all calibrated against 30
  (`MASTERY_MIN_ATTEMPTS` is "20 of the last 30"; `engine.js` scales tolerated errors
  by `RECENT_WINDOW`) — **do not widen them**. Pass a span explicitly only for
  selection/ranking. Note `weakness()` uses *lifetime* stats and needs no window.
  No migration was required: short existing buffers are valid and just grow.
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
  weak over the **frequency-normalized `focusWindow(id)` span** (~5 sessions per key,
  NOT the 30-attempt mastery window — see "Two evidence spans" above)
  (≥`ADAPT_ERR_WEAK` errors or ≥`ADAPT_LAT_WEAK`× your
  median latency, with ≥`ADAPT_MIN_ATTEMPTS` data); `probes` = under-sampled/stale
  digits+symbols. Focus is ranked by `impact(k) = weakness(k) × importance(k)`
  (`importance` = key usage frequency, research/08) so a weak common key beats a weak
  rare one; `weakest()` (the panel) sorts by `impact` too. `adaptiveLine()` =
  weak-letter-biased `wordLine()` + `sentenceLine`
  + `spliceAtSpace(burstTokens(k))` for a focus/probe key words can't cover (digits,
  symbols, `z`/`q`; `pickBurstKey` cadence). Mastery still
  accrues (display/continuity) but does **not** gate. HUD slot shows focus keys, not
  ETA. **Focus is computed ONCE PER LINE and cached** in `app.js currentFocus`
  (set in `refreshKeyboardMastery`) — `updateHud` runs on a 250ms tick, and
  recomputing focus there made threshold-adjacent keys flicker at 4Hz, which read as
  "the focus keys keep changing". Never call `adaptiveFocus()` from a tick handler. Summary uses `sessionKeyDeltas()` ("Improved this session"). Not in
  `FLUENCY_MODES` (so `checkProgress` still marks mastery) but in `FULL_POOL_MODES`.
- **Remediation intensity (measured, not guessed — research/11)**: being "in focus" used
  to be nearly cosmetic — a focus letter went 1.65% → 2.32% of typed chars (+41%, ≈6
  extra reps a session). Three compounding causes: `WEAK_WORD_BOOST` was 1.5 capped at
  2 hits; ~30% of lines are verbatim sentences carrying **zero** bias; and the 260-word
  corpus held only 18 words containing `p` (1 for `j`, 0 for `q`/`z`). Now: corpus
  **2000 words** (`words.js`, `/^[a-z]{1,12}$/`; `p` 374, `q` 0→39, `j` 1→39),
  `WEAK_WORD_BOOST = 9` counting **occurrences** (so `pepper` > `top`; capped by
  `WEAK_WORD_HIT_CAP = 3`), and `ADAPT_SENTENCE_P_FOCUS = 0.15` replacing
  `ADAPT_SENTENCE_P` while a focus set exists. Measured: **2.65% → 16.62% (+527%)**,
  with 83% of a session's words still distinct.
  **Trap:** `wordLine`'s legacy fallback names *some* weakest letter even when nothing
  is weak; applying the 9× boost there hammered an arbitrary key (healthy `p` drifted to
  4.01%). The boost is therefore **threaded**: `WEAK_WORD_BOOST` only when a real
  `weakSet` is passed in, `WEAK_WORD_BOOST_AMBIENT` (1.5) otherwise — ramp/caps callers
  keep ambient. `WEAK_WORD_BOOST` was the intensity dial — **superseded by research/12**.
- **Guaranteed exposure (research/12 — supersedes the boost tuning above)**: score-
  boosting can never reach rare letters. Measured ceilings as *sole* focus key: `e` 30%,
  `c` 14%, `v` 4.7%, `x` 2.0%, `z` **0.18%** — only ~2% of corpus words contain
  `z`/`x`/`j`/`q`, so no multiplier helps (and `9^hits` swamped every other term in
  `scoreWord`, making the base a no-op). Exposure is now **stated and enforced**:
  `enforceFocusDose()` tops each focus key up to `FOCUS_REPS_PER_LINE` (3) per word line
  via `focusBurst(key, n)` (companion-interleaved — spaced, not massed);
  `enforceCoverage()` forces the stalest **letter** in after `COVERAGE_MAX_GAP` (400)
  keystrokes so nothing becomes unmeasurable. `WEAK_WORD_BOOST` back to 1.5.
  **Coverage is letters-only on purpose:** one forced key per line across all ~102 pool
  keys = ~3300-keystroke rotation, so a symbol would need ~30 sessions to reach
  `ADAPT_MIN_ATTEMPTS` — visible but never measurable. a–z rotates in ~830. Digits/
  symbols use the stronger `pickBurstKey` probe path + the deliberate rounds.
  **Sentence lines carry NO dose** (verbatim) — "guaranteed" means *on word lines*.
  **KNOWN GAP:** this fixes *how much*, not *which*. On a real profile (`z` 23%, `v` 16%,
  `x` 16%, `c` 15%, `e` 10%) focus is still `[e, s, c]` — `impact = weakness × importance`
  buries rare keys, and `s` enters on the *slow* criterion at 8% while `z` at 23% does
  not. Fallbacks are written up in research/12 §"Alternative paths" (dampen importance
  via `sqrt`; reserve a slot for worst raw error rate; user-defined importance /
  exempt list). **Read that before re-tuning anything here.**
- **Outcome metric — focus episodes (research/13, schema v4)**: the app now measures
  whether remediation *worked*, not just whether it happened. `syncFocusEpisodes()` runs
  per line and diffs the focus set: entry records `{in, errIn, attemptsIn}`, exit records
  `{out, errOut, reps}` into `keys[id].episodes` (ring-buffered at `EPISODES_MAX`=10),
  and bumps `keys[id].focusCount` (**lifetime, never trimmed** — relapse count is the
  point and must not saturate). Read it with `Engine.focusOutcomes()`.
  **Interpret the COMBINATION, not either half:** relapse + *high* reps = dose fine,
  released too early (widen `FADE_WINDOW`/exit threshold); relapse + *low* reps = dose
  too thin (raise `FOCUS_REPS_PER_LINE` or lower `ADAPT_FOCUS_N`).
  **Fade-out, not a cliff:** a graduated key keeps tapering support over `FADE_WINDOW`
  (1200 keystrokes), `FADE_REPS_START` 2 → `FADE_REPS_END` 1, via `fadingKeys()`/
  `fadeReps()` merged into `enforceFocusDose`. Abrupt withdrawal is a plausible *cause*
  of relapse and would otherwise be misdiagnosed as too small a dose.
  **Trap:** the v3→v4 migration deliberately does **NOT** back-fill episodes — we never
  observed past ones and fabricating them would poison the only outcome metric there is.
  **Trap:** dose counting must include capitals (`C` counts toward `c`); missing this
  silently over-delivered bursts.
  **`ADAPT_FOCUS_N` stays 3 on purpose** — changing two levers at once makes the metric
  uninterpretable. Get real session data before tuning anything here.
- **Curriculum & levels (Beginner course)**: `STAGES` in `engine.js`.
  `settings.levelChoice` ∈ `'adaptive' | 'auto' | '<stageIndex>' | 'all' | 'words' |
  'sentences'`. A stage (row) is completed only when all its keys are individually
  mastered (`canAdvanceStage`); `maybeAdvanceStage()` advances in `'auto'` and fires
  mid-session via `checkProgress()`. `'all'`/`'words'`/`'sentences'` are **fluency
  modes** (`FLUENCY_MODES`); `FULL_POOL_MODES` adds `'adaptive'` (all = null target,
  full pool).
- **Deliberate rounds (research/09)**: `RAMP_LEVELS` maps the Beginner-course levels
  `'4'` Numbers / `'5'` Symbols / `'6'` Special keys to a heavy woven-in-words round,
  NOT adaptive. `acquisitionRamp()` → `{track, active, introduced, next}`, derived from
  stats (nothing persisted): ~3 keys active at once, each incorporated as soon as typed
  *accurately* a few times (`rampReady`: ≥4 reps, `errRate≤0.5`, **exposure-based, no
  speed** — learning errors must NOT stall progress), earlier keys accumulating in
  `introduced`. `generateLine` routes those levels → `rampWordLine()`; per-track density
  in `RAMP_TRACK` (digits ~1:2, symbols high, specials ~1:4 since disruptive). Full
  `isMastered` (speed-gated) accrues but doesn't drive the ramp. `checkProgress` emits
  `{type:'rampAdvance'}`. **Adaptive** gets only `sprinkleDigits()` (~1%), not a ramp.
- **Mac shortcuts mode (`levelChoice: 'shortcuts'`, research/10)**: `js/shortcuts.js`.
  `generateLine` → `Shortcuts.shortcutLine()` returns a **single `{type:'shortcut'}` token**
  (a card, not `.tok` spans). `app.js` has a dedicated path: `renderShortcutCard`,
  `handleShortcutKey` (claims Cmd combos at the TOP of `onKeydown`, before the
  let-shortcuts-through line), `answerShortcut`, `judgeShortcut` (records `sc:<id>`
  produce / `scq:<id>` knowledge as synthetic keys — no schema change). Combo detection
  uses `e.code` (Shift/Option-proof). **Knowledge-only shortcuts (⌘W/⌘Space…) have
  `keys:null` and only get multiple-choice prompts — never required by keypress.**
  `checkProgress`/`stageLabel` early-return to shortcuts helpers.
- **Push mode (research/04)**: `settings.pushMode` (home-screen toggle) → a rAF pacer in
  `app.js` (`startPacer`/`pacerLoop`/`onPacerCaught`) sweeps the prompt at `Stats.targetWpm()`
  (recent avg ×1.15, floored 20); non-punishing catch (flash+rebase). `effectiveStrict() =
  strictMode && !pushMode` relaxes error-correction while pushing (never mutates stored setting).
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

Key `typing_app_v1`; `version: 4`. Migrations in `stats.js migrate()`: v1→v2 adds
`recent[]` + seeds `mastered` from lifetime stats; v2→v3 makes `'adaptive'` the
default (flips only barely-started `'auto'` users; adds `adaptiveNoticeShown`); v3→v4
adds focus-episode instrumentation (`focusOpen`, per-key `episodes[]` + `focusCount`) —
purely additive, and deliberately **not** back-filled (research/13).
Per-key `recent` is a ring buffer (max `RECENT_MAX` = 200): `>0` = correct latency ms,
`0` = correct w/o latency (specials), `-1` = error.

`{ version:4, seenCounter, focusOpen:{ id:{in,errIn,attemptsIn} },
   keys:{ id:{attempts,errors,sumLatencyMs,samples,lastSeen, recent:[…], mastered, masteredAt,
              episodes:[{in,errIn,attemptsIn,out,errOut,reps}], focusCount} },
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

**LIVE at https://jades1.github.io/typing_app/** — GitHub Pages, legacy branch-based
build deploying from `main` root (no workflow file). **A push to `main` publishes.**

See the parent `Projects/CLAUDE.md` for the Pages build-vs-deploy gotcha: verify the
live URL actually updated (`curl -s '<url>?cb=<ts>' | grep <new-marker>`), and on a
stuck deploy do **one** empty-commit re-trigger, then wait ~60 min — don't hammer the
per-repo hourly build limit.

The cache-busting step there does **not** apply: this app has no service worker and no
manifest, so there are no installed clients holding stale assets — only ordinary
browser caching of the JS modules.
