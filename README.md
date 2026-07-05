# Adaptive Typing Trainer

A browser-based typing trainer (in the spirit of TypingClub / keybr) that
introduces keys **one at a time** and drills each to automaticity before moving
on — interleaving the key you're learning only with keys you've already mastered,
while showing the correct finger for every key, including special keys like Tab,
Shift, Command, Control, and Option.

No build step, no dependencies. Open `index.html` in a browser and start typing.

## Features

- **One key at a time, to mastery** — the trainer introduces a single new "target"
  key and drills it (interleaved with keys you've already mastered) until it clears
  a per-key **speed *and* accuracy** gate — roughly **35 WPM (≤343 ms/keystroke)
  at ≥95% accuracy**, measured over a recent window. Only then does it graduate and
  the next key is introduced. Interleaving is the *reward* for mastery, not the way
  keys are first learned.
- **Speed-gated progression** — a level (a whole keyboard row) is completed only
  when every key it introduced is individually mastered on both speed and accuracy
  — not merely typed accurately once or twice.
- **"Next key" time estimate** — a live HUD readout estimates, at your current
  pace, roughly how long until the current key is mastered and the next unlocks
  (a coarse `<1 / ~N / 10+ min` guide, not a precise countdown).
- **In-session notifications** — a transient banner announces when a new key is
  introduced and when you complete a level, so progression is never silent.
- **Keyboard mastery view** — each key on the on-screen keyboard fills bottom-up in
  its finger colour as your confidence with it grows; the key currently being
  introduced is ringed.
- **On-screen keyboard with finger guidance** — a Mac QWERTY keyboard colour-
  coded by finger, highlighting the next key to press (and the correct Shift for
  capitals/symbols), with a text hint naming the finger.
- **Finger-guide toggle** — a home-screen toggle hides the finger hint text once
  the keys are automatic (the colour tints stay); your choice is remembered.
- **Special-key training** — Tab, Shift, Command, Control, and Option are drilled
  as their own prompts, each with the correct finger (graduation is accuracy-based,
  since they emit no timing).
- **Hybrid practice text** — pronounceable letter clusters for letters, standalone
  tokens for numbers and symbols, and explicit prompts for special keys.
- **Timed daily sessions** — pick a length (1/3/5/10/15 min), get a live countdown
  with running WPM and accuracy, and an end-of-session summary.
- **Selectable levels** — a **Level** picker lets you jump straight to what you
  want to drill: *Adaptive (auto-level)* introduces keys one at a time through a
  curriculum (home → top → bottom → capitals → numbers → symbols → special keys);
  pick a specific level (e.g. **Numbers**) to master that group's keys one at a
  time on top of earlier ones; or **All keys** for a full weakness-weighted mix
  (no single target — the classic mixed-review mode).
- **Streaks & stats** — daily practice streak, minutes-today vs. goal, a live
  "keys to focus on" list, and a recent-WPM bar chart.
- **Strict vs. forgiving mode** — require correcting each error before advancing,
  or keep flowing.
- **Light / dark / auto theme.** Progress is saved locally in your browser
  (`localStorage`).

## Running

Open `index.html` directly, or serve the folder (e.g. `python3 -m http.server`)
and visit it. Everything runs client-side.
