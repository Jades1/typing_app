# 05 — Practice material: random clusters vs. real words/sentences

**Date:** 2026-07-05
**Question:** Is our pronounceable-cluster (non-word) practice the best material,
or should we train on real words / sentences? Does cluster practice transfer to
real typing?

## Findings
- **Expert typing is hierarchical and chunked.** Units scale from letters to
  words; *"word context activates sequences of keypresses retrieved on-the-fly
  from long-term memory."*
- **The signature of expertise is sensitivity to real-language bigram/trigram
  frequency** in the gaps between keystrokes — and that sensitivity *increases*
  with skill. Typists *"tune their performance toward the statistics of natural
  language."*
- **Random / pseudoword practice does not train that.** Critique: *"typing
  nonsense syllables does not transfer well to real language, where word
  boundaries, common bigrams, and muscle memory all play important roles"*; real
  sentences also add punctuation flow, capitalization, and word-boundary rhythm.
- Directional (not lab) data point: random-character tasks ~71 keys/min vs. text
  ~241 keys/min.
- keybr's counter-argument: pronounceable clusters **prevent word anticipation**
  and build character-level fluency — genuinely useful **early**, but bounded.
- Curricula converge on a **progression: keys → common words → sentences →
  paragraphs**.

## What this means for us
Our approach (keys + pronounceable clusters + isolated symbols/specials) is
**correct for acquisition but incomplete for transfer** — it stops before the
real-word/sentence practice that builds the bigram + word chunking responsible for
real-world speed. **Add a words → sentences phase** layered on the existing mastery
model: (1) high-frequency real words composed only of unlocked/mastered keys, then
(2) real sentences once enough keys are unlocked; keep adaptive weakness targeting
throughout. → Decision 05 (**Built** — designed at Fable tier).

**As built:** a derived `materialLevel()` (`clusters → words → sentences`) driven
purely by mastery state. Once all pool letters are mastered, the letters backbone of
each line renders real words (from a bundled `words.js` corpus, filtered to mastered
letters, weakness-weighted); once caps + `.`/`,` are mastered, a `sentences` mode
serves verbatim corpus sentences. No new persistence; digit/symbol acquisition
continues around the word material.

## Sources
- "Typing expertise in a large student population," Cognitive Research: Principles
  and Implications (Springer, 2022) — **PEER-REVIEWED** (full text auth-walled;
  finding corroborated across the sources below)
- "Motor expertise for typing impacts lexical decision performance" (ScienceDirect) — **PEER-REVIEWED**
- Behmer & Crump, "Crunching big data with finger tips: how typists tune to the
  statistics of natural language" — **PEER-REVIEWED**
- Keybr review, CosmicKeys (pseudoword transfer critique) — **COMMERCIAL**
- TypingMentor (the 71 vs 241 keys/min figure) — **COMMERCIAL** (directional only)

## Confidence
**Strong** on the science (chunking + bigram-frequency tuning grows with
expertise — established cognitive psychology: Rumelhart & Norman, Salthouse,
Behmer & Crump, Yamaguchi & Logan). **Directional only** on the specific transfer
*speed numbers*, which come from commercial typing sites.
