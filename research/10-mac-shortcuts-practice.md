# 10 — Mac keyboard-shortcuts practice mode

**Date:** 2026-07-06
**Question:** How to let the user practice (and be quizzed on) Mac keyboard
shortcuts inside a browser typing app?

## Constraints / findings
- Many Mac shortcuts **can't be safely practiced in a browser**: destructive ones
  (⌘W closes the tab, ⌘Q quits, ⌘T/⌘N) and **OS-level** ones (⌘Space Spotlight, ⌘Tab
  app-switcher, ⌘⇧4 screenshot) — the page can't reliably intercept or `preventDefault`
  them, and firing them disrupts the user.
- So each shortcut is tagged **catchable** (safe to press, we `preventDefault` it) vs
  **knowledge-only** (present + quiz, never require the keypress).
- The user wanted to be tested on both *producing* the combo AND *knowing what it does*.

## What we built (Decision 10 — Built)
A `levelChoice: 'shortcuts'` mode (`js/shortcuts.js`), **25 curated shortcuts**
(user excluded the 7 they already know: ⌘C/V/Z/P/F/S/Q). Two skills tracked as
synthetic keys in the existing per-key store (no migration): `sc:<id>` (produce),
`scq:<id>` (knowledge).
- **Produce** (catchable only): action shown → user presses the real combo, detected
  via `KeyboardEvent.code` (Shift/Option-proof), `preventDefault`ed.
- **Knowledge** (all 25): **multiple-choice**, answered with keys 1–4 — objectively
  gradeable, keyboard-driven, and safe for the uncatchable shortcuts (never fires the
  real key). Wrong answers reveal the correct one (teaching).
- **Safety:** knowledge-only entries have `keys:null` (never required by press); a
  card renders a warning note (e.g. "would close this tab"); Escape = reveal & move on.
- Weakest shortcuts resurface more (weighted scheduler); summary shows "known N/25".

## Confidence
**Strong** on the design (MC for knowledge + code-based detection + catchable/knowledge
split is the right shape). The exact 25 and thresholds are tunable ("we'll look deeper").

---

Also this session: **a large literary corpus** (`js/literary.js`, ~240 varied
sentences) merged into `words.SENTENCES`, because Adaptive/Sentences were cycling a
tiny ~48-sentence set. Original ASCII-clean prose (no copyright), since the app is
offline/bundled and can't fetch real articles.
