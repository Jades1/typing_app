# 07 — Content-first adaptive as the default (not sequential introduction)

**Date:** 2026-07-05
**Question:** Should the app march every user through a fixed key-introduction order
(a → s → d → f …), or type real content and drill the keys the user is actually
weak on?

## Findings / rationale
- The target user is an **improver**: they mostly know the keyboard already and are
  **uncertain of a handful of keys** (often symbols, numbers, or a couple of awkward
  letters) — not an absolute beginner.
- For that user, a fixed sequential curriculum is backwards: you can't "detect weak
  keys" from someone who can't find any keys, but you *can* from someone who already
  types. Marching them through home-row drills wastes time on keys they own.
- This aligns with the transfer research (05): real words/sentences build the
  chunking that produces speed; and with how mainstream improver tools (keybr after
  unlock, monkeytype, TypeRacer) actually work — type real content, surface weak
  spots, remediate.
- **Sequential introduction is still right for absolute beginners** (research/02) —
  so it's retained, but demoted to an opt-in "Beginner course," not the default.

## What we built (Decision 07 — Built)
`levelChoice: 'adaptive'` is the **default** mode:
- Full keyboard from the start; no key-introduction order; real words/sentences.
- `adaptiveFocus()` identifies the **≤3 keys** that measure weak over the recent
  window (≥10% errors or ≥40% slower than the user's own median, with ≥8 attempts of
  data); a recovered key drops out automatically — no over-drilling mastered keys.
- Weak **letters** get more exposure via weak-key-biased word selection; weak
  **non-letters and rare letters** (numbers, symbols, `z`/`q` — which appear in zero
  corpus words) get short **targeted bursts** spliced into the line. Net ≈90% real
  content, ≤10% drill.
- Mastery flags still accrue (display + cross-mode continuity) but **don't gate**
  content in adaptive mode.
- Sequential curriculum kept as the "Beginner course" (`levelChoice: 'auto'` +
  stage indices). Migration v2→v3 flips only barely-started users to the new
  default; established users keep their mode + get a one-time discovery notice.

**Process note (honest):** we built the sequential engine (Option B) first and only
surfaced the "who is this for?" question later. Lesson logged: for a product, pin
the target user before designing the core mechanic. Almost all of the Option B
machinery (weakness scoring, mastery gate, drill-to-mastery, word corpus) was
reused, so little was wasted.

## Sources
- Builds on research/02 (sequential = beginners) and research/05 (transfer via real
  content). No new external sources; this is a product-direction decision grounded
  in the prior findings + the stated target user.

## Confidence
**Strong** on direction (content-first adaptive is the right default for improvers;
sequential belongs behind a beginner toggle). The specific weak-key thresholds and
blend ratios are tunable design choices.
