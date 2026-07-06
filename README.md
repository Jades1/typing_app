# Adaptive Typing Trainer

A browser-based typing trainer (in the spirit of keybr / monkeytype) that, by
default, has you **type real words and sentences** while it finds the handful of
keys you're actually shaky on and drills *those* — without wasting your time on the
keys you already own. A separate **Beginner course** teaches key locations one at a
time for people starting from scratch. It shows the correct finger for every key,
including special keys like Tab, Shift, Command, Control, and Option.

No build step, no dependencies. Open `index.html` in a browser and start typing.

## Features

- **Adaptive mode (default)** — type real words and sentences from the start; the
  app watches your recent per-key error rate and speed, identifies the **≤3 keys
  you're actually weak on**, and remediates them surgically: it biases word choice
  toward words containing your weak *letters*, and splices short **targeted bursts**
  for keys real words can't cover (numbers, symbols, and rare letters like `z`/`q`).
  ~90% real content, ≤10% drill; recovered keys drop out of focus automatically, so
  it never over-drills what you've already got. The HUD shows your current focus
  keys; the end-of-session summary reports which keys **improved**.
- **Deliberate rounds for Capitals, Numbers, Symbols, and Special keys** — each of
  those levels teaches its keys a few at a time, heavily over-exposed **woven inside
  real words** (Capitals Title-case `Here Hill Show So About`; Numbers `Room 747 has
  747 child 74` ~1:2; Symbols `Song. idea' high' Must.`; Special keys `and [Ctrl]
  these [Alt] Never [Tab]` ~1:4, lighter since they disrupt flow). As soon as you type a key *accurately* a few times the next slides in — so
  you work through them fast — and earlier ones keep appearing so their speed builds.
  Adaptive mode keeps only a **light sprinkle** of numbers so it stays word-focused.
- **Push mode** — a home-screen toggle for breaking speed plateaus: a **pace marker**
  races through the line at ~15% above your recent average; you try to stay ahead of
  it. Getting caught just flashes (no reset), and errors are tolerated — the point is
  speed. The summary reports how many lines you stayed ahead on.
- **Beginner course (optional)** — for people who don't yet know key locations: the
  trainer introduces a single new "target" key and drills it (interleaved with keys
  you've already mastered) until it clears a per-key **speed *and* accuracy** gate —
  roughly **35 WPM (≤343 ms/keystroke) at ≥95% accuracy** — then graduates it and
  introduces the next. Interleaving is the *reward* for mastery, not the way keys
  are first learned.
- **Speed-gated progression** — a level (a whole keyboard row) is completed only
  when every key it introduced is individually mastered. **Letters** need fluency
  (≈35 WPM at ≥95%); **numbers and symbols** use a faster, accuracy-focused gate
  (lenient speed, fewer reps) — because for low-frequency keys the goal is reliable
  *location + finger recall*, not letter-level speed (research-backed).
- **Real words → sentences fluency phase** — once you've mastered the letters, the
  practice material graduates from pronounceable clusters to **real words** (drawn
  from a common-word list, still weighted toward your weak keys), and then to
  **real sentences** (with capitalization and punctuation) once caps and `.`/`,`
  are mastered. This builds the word/bigram "chunking" that produces real-world
  typing speed — the transfer that random clusters alone don't train.
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
- **Motivational session feedback** — the end-of-session summary shows whether
  you're improving: your WPM and accuracy vs. your recent average (▲/▼), a
  personal-best badge, the keys you mastered *this session*, overall
  *N / total keys mastered*, your top weak spots with real numbers (error % / ms),
  and an honest encouragement line (a slower session on a hard new key is framed
  as expected, not failure).
- **Keys-mastered list** — a side-panel card lists every key you've mastered
  (green chips, curriculum order) with a running count — the positive counterpart
  to "keys to focus on", so progress stays visible.
- **Selectable levels** — a **Level** picker lets you choose: **Adaptive**
  (default, above); the **Beginner course** — the *Guided course (auto-level)* that
  walks the curriculum (home → top → bottom → capitals → numbers → symbols → special
  keys), or a specific level (e.g. **Numbers**) to master that group's keys on top
  of earlier ones; or **Free practice** — **Words**, **Sentences**, or **All keys**
  (a full weakness-weighted mix).
- **Streaks & stats** — daily practice streak, minutes-today vs. goal, a live
  "keys to focus on" list, and a recent-WPM bar chart.
- **Strict vs. forgiving mode** — require correcting each error before advancing,
  or keep flowing.
- **Light / dark / auto theme.** Progress is saved locally in your browser
  (`localStorage`).

## Running

Open `index.html` directly, or serve the folder (e.g. `python3 -m http.server`)
and visit it. Everything runs client-side.
