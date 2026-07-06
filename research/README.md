# Research & design-decision log

Why this exists: the evidence behind how this app teaches typing used to live only
in chat and evaporated. This folder is the durable record — **read it before
changing the curriculum, mastery gate, or practice material**, and add to it
whenever we research or decide something.

## How to use it
- Each `NN-topic.md` file is one research thread, in a fixed shape (Question,
  Findings, Sources, Confidence, Implication, Status).
- Every characterized claim carries a **source** + a **quality tag**
  (`PEER-REVIEWED` / `COMMERCIAL` / `ANECDOTAL`) + a **confidence** level, so we
  never treat a typing-blog stat like a lab finding. (Verify before you
  characterize — adapted to research.)
- New finding → add/extend a topic file. New design choice → add a row below and
  link the topic that backs it.

## Design decisions ← evidence

| # | Decision | Rationale (short) | Backing | Status |
|---|----------|-------------------|---------|--------|
| [01](01-interleaving-contextual-interference.md) | Interleave **mastered** keys only, never a batch of un-mastered ones | Contextual-interference effect: mixed practice aids retention/transfer | PEER-REVIEWED | **Adopted** |
| [02](02-mastery-one-key-at-a-time.md) | Introduce **one key at a time**, drill to a per-key gate before advancing | Overlearning → automaticity; standard touch-typing pedagogy | Mixed (peer-reviewed + curricula) | **Adopted** |
| [03](03-keybr-thresholds.md) | Gate = **~35 WPM (≤343 ms/key) + ≥95% accuracy** over a recent window | keybr's confidence threshold | COMMERCIAL / community | **Adopted** |
| [04](04-plateaus-push-faster.md) | Add a "push" mode: type ~10–15% faster than comfortable to break plateaus | Deliberate-practice research | Mixed | **Open / candidate** |
| [05](05-chunking-words-vs-clusters.md) | Add a **real-words → sentences** phase after key mastery | Expert typing = bigram/word chunking; clusters don't train transfer | PEER-REVIEWED (science) + COMMERCIAL (numbers) | **Built** |
| [06](06-numbers-symbols-gate.md) | **Faster, accuracy-focused gate** for numbers/symbols (~600 ms, fewer reps) | Low-frequency keys need location + finger recall, not fluency | COMMERCIAL | **Built** |
| [07](07-content-first-adaptive-default.md) | **Content-first adaptive is the default**; sequential curriculum demoted to a "Beginner course" toggle | Target user is an improver uncertain of a few keys, not an absolute beginner | derived from 02 + 05 | **Built** |
| [08](08-key-importance-weighting.md) | Rank what-to-work-on by **impact = weakness × usage frequency** (a weak common `p` beats a weak rare `$`) | Improving a common key pays off across all typing; a rare key barely moves the needle | ANECDOTAL (letter-freq data) | **Built** |

## Status legend
**Adopted** = in the app · **Proposed** = decided, not yet built · **Open /
candidate** = evidence supports it, decision pending · **Rejected** = considered
and dropped (record why).
