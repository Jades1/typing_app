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
  stats.js      per-key stats, WPM/accuracy, session history, streaks, localStorage
  engine.js     weakness scoring, stage curriculum, breadth rule, line generator
  keyboard.js   render on-screen keyboard, highlight next key + finger
  session.js    countdown timer, live HUD metrics, end-of-session summary
  app.js        wire-up: keydown handling, practice loop, settings, stats panel
```

## Key design points

- **Two independent levers** (see `engine.js`): *weakness weighting* sets emphasis
  (error rate + latency vs. baseline + recency + intro bonus); a *breadth/rotation
  rule* (decaying recently-used penalty + no-immediate-repeat) guarantees variety
  so a weak category exercises many keys, not just the worst one or two.
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
  `'auto' | '<stageIndex>' | 'all'`. In `'auto'`, `maybeAdvanceStage()` advances
  through stages at session end. Picking a specific level pins the pool to that
  stage (cumulative) and `focusSet()` makes that level's *own* new keys dominate
  (weakness ×4) while staying interleaved with earlier keys. `'all'` = full pool.

## Data model (`localStorage`)

`{ version, seenCounter, keys:{ id:{attempts,errors,sumLatencyMs,samples,lastSeen} },
   sessions:[{date,ts,durationMs,chars,correct,attempts,errors,wpm,accuracy}],
   settings:{ sessionMinutes, stage, levelChoice, strictMode, theme, dailyGoalMinutes } }`

## Testing / running

Open `index.html` or `python3 -m http.server` in this folder. To verify the
adaptive loop, deliberately mistype one key repeatedly and confirm it shows up
more (and in the "keys to focus on" list) in later lines.

## Deploy

Intended for GitHub Pages (static, deploy from `main` root) — not yet set up. See
the parent `Projects/CLAUDE.md` for the Pages build-vs-deploy and cache-busting
gotchas before deploying.
