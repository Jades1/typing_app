# Adaptive Typing Trainer

A browser-based typing trainer (in the spirit of TypingClub) that learns which
keys slow you down and drills those harder — interleaved with keys you already
know — while showing you the correct finger for every key, including special keys
like Tab, Shift, Command, Control, and Option.

No build step, no dependencies. Open `index.html` in a browser and start typing.

## Features

- **Adaptive drilling** — tracks per-key accuracy and speed, scores each key's
  "weakness," and over-weights your weak keys in the generated practice text.
- **Breadth, not fixation** — when a category is weak (say, numbers), it rotates
  you through *many* different keys rather than hammering the same one or two;
  weak keys are interleaved with mastered ones for better retention.
- **On-screen keyboard with finger guidance** — a Mac QWERTY keyboard colour-
  coded by finger, highlighting the next key to press (and the correct Shift for
  capitals/symbols), with a text hint naming the finger.
- **Special-key training** — Tab, Shift, Command, Control, and Option are drilled
  as their own prompts, each with the correct finger.
- **Hybrid practice text** — pronounceable letter clusters for letters, standalone
  tokens for numbers and symbols, and explicit prompts for special keys.
- **Timed daily sessions** — pick a length (1/3/5/10/15 min), get a live countdown
  with running WPM and accuracy, and an end-of-session summary.
- **Selectable levels** — a **Level** picker lets you jump straight to what you
  want to drill: *Adaptive (auto-level)* progresses through a curriculum (home →
  top → bottom → capitals → numbers → symbols → special keys) as you hit
  accuracy/speed thresholds; or pick a specific level (e.g. **Numbers** or
  **Symbols**) to hammer that group — its keys get heavy emphasis while staying
  interleaved with easier keys — or **All keys** for a full mix.
- **Streaks & stats** — daily practice streak, minutes-today vs. goal, a live
  "keys to focus on" list, and a recent-WPM bar chart.
- **Strict vs. forgiving mode** — require correcting each error before advancing,
  or keep flowing.
- **Light / dark / auto theme.** Progress is saved locally in your browser
  (`localStorage`).

## Running

Open `index.html` directly, or serve the folder (e.g. `python3 -m http.server`)
and visit it. Everything runs client-side.
