// engine.js — adaptive practice generator.
//
// Two independent levers, as specified in the plan:
//   1. Weakness weighting decides EMPHASIS (slow / error-prone / stale keys show
//      up more, and unseen keys get introduced).
//   2. A breadth / rotation rule guarantees VARIETY — we sample across the whole
//      weak set, suppress just-used keys, and forbid immediate repeats, so a
//      "numbers" focus rotates through many digits instead of hammering 1 and 7.
//
// Output is a list of tokens; each token is one thing to type:
//   { type:'char'|'special', display, expected, keyId, needsShift }

import {
  KEY_FINGER, SYMBOLS, SPECIAL_KEYS, needsShift, whichShift,
} from './fingers.js';
import * as Stats from './stats.js';
import * as Words from './words.js';
import * as Shortcuts from './shortcuts.js';

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

// --- one-key-at-a-time introduction constants --------------------------------
// (Mastery-gate thresholds — RECENT_WINDOW, TARGET_MS, MASTERY_* — live in
// stats.js and are read via the Stats namespace, so there's one source of truth.)
const TARGET_PICK_P = 0.5;        // target key ≈ 1/3 of picks (w/ no-immediate-repeat)
const MIN_DRILL = 6;              // cold-start: keep at least this many keys in rotation
const MIN_TARGET_CAT_SLOTS = 3;   // slot floor when the target is a digit/symbol/special

// --- words → sentences fluency phase constants -------------------------------
const MIN_ELIGIBLE_WORDS = 12;      // fewer eligible words → fall back to clusters
const MIN_ELIGIBLE_SENTENCES = 8;   // fewer eligible sentences → word lines instead
const WORD_LINE_TARGET_CHARS = 32;  // ≈ current line length
const WORD_LINE_MAX_WORDS = 8;
const MAX_WORD_LEN_MIXED = 7;       // word-length cap when a word fills a mixed line's letters slot
const CAPS_WORD_P = 0.2;            // capitalize a word's first letter (when caps unlocked)
const SENTENCE_LINE_P = 0.6;        // terminal fluency: sentence vs word line
const MIXED_LINE_P = 0.3;           // terminal fluency: classic mixed line (keeps digits/symbols in rotation)
const FREQ_WEIGHT = 0.6;            // frequency-rank boost in word scoring
const WEAK_WORD_BOOST = 1.5;        // words containing the weakest mastered letter
const RECENT_WORD_DECAY = 0.55;
const RECENT_WORD_PENALTY = 1.8;
const SENTENCE_NO_REPEAT = 5;

// --- content-first adaptive mode constants -----------------------------------
const ADAPT_FOCUS_N = 3;          // max keys under active remediation at once (surgical)
const ADAPT_MIN_ATTEMPTS = 8;     // recent attempts before a key can be judged weak
const ADAPT_ERR_WEAK = 0.10;      // recent error rate ≥ this → weak
const ADAPT_LAT_WEAK = 1.40;      // recent avgLat ≥ 1.4 × your median → weak
const ADAPT_STALE = 2000;         // keystrokes since a digit/symbol was seen → re-probe
const MIN_FOCUS_WORDS = 4;        // < this many corpus words contain the letter → burst instead
const DRILL_EVERY = 2;            // focus-key burst at most every N lines
const PROBE_EVERY = 3;            // coverage probe burst at most every N lines
const ADAPT_SENTENCE_P = 0.35;    // sentence-line probability (when no burst pending)
const BURST_TRIM = 8;             // chars trimmed from the word backbone when a burst is injected
const ADAPT_SPRINKLE_P = 0.5;     // adaptive word line: chance to sprinkle in a number (light)

// --- deliberate non-letter acquisition ramp (adaptive mode, research/09) ------
// Numbers/symbols/specials are hard AND rare in text, so they need OVER-practice
// to be learned. Introduce a couple at a time and over-expose them (far above
// natural frequency) woven inside real words, until each masters (lenient gate);
// then they fall back to normal impact-weighted remediation.
const RAMP_DIGITS = ['4', '7', '5', '6', '3', '8', '2', '9', '1', '0'];  // by finger, easiest reach out
const RAMP_SYMBOLS = [',', '.', "'", '-', '?', '!', ';', ':', '"', '/',
  '(', ')', '_', '=', '+', '@', '#', '$', '%', '&', '*', '[', ']', '^'];
const RAMP_SPECIALS = ['Tab', 'Control', 'Alt', 'Meta'];   // Shift trained via caps
const RAMP_CAPS = 'TASHWIOBMFCLDPNEGRUVKYJQXZ'.split('');  // uppercase by word-initial frequency
const RAMP_MIN_LETTERS_MASTERED = 18;   // letters solid before the ramp starts
const RAMP_ACTIVE_N = { digits: 3, symbols: 3, specials: 3, caps: 4 };  // more at once → interleaving / work through faster
const RAMP_REST_EVERY = 8;      // every 8th line is a normal adaptive line (mostly number lines)
const RAMP_INJECT_P = 0.95;     // inject a ramp chunk after nearly every word
const RAMP_CHUNK_MIN = 2, RAMP_CHUNK_MAX = 3;
const RAMP_MIN_HITS = 6, RAMP_MAX_HITS = 12;  // ramp keystrokes/line — target ~1 number per 2 letters
const RAMP_COMPANION_P = 0.25;  // chance a chunk slot uses a mastered same-category key
const RAMP_SENTENCE_P = 0.15;   // sentence probability on rest lines while ramping
const RAMP_SPECIALS_PER_LINE = 2;
const RAMP_TRAIL_SYMBOLS = new Set([',', '.', '?', '!', ';', ':', "'"]);  // attach to a word's end
// Per-track injection density: digits heavy (~1:2); special keys lighter (~1:4) since
// Tab/Ctrl/Alt/Meta disrupt flow more.
const RAMP_TRACK = {
  digits:   { injectP: 0.95, maxHits: 12, minHits: 6 },   // ~1:2
  symbols:  { injectP: 0.95, maxHits: 14, minHits: 6 },   // high proportion (user wants more)
  specials: { injectP: 0.8,  maxHits: 6,  minHits: 3 },   // ~1:4 (disruptive)
};

// Numbers/symbols use a faster, accuracy-focused gate than letters — research says
// the competency for low-frequency keys is location + finger recall, not fluency
// (see research/06). Specials keep speed waived. Values in ms / counts.
function gateFor(keyId) {
  if (isSpecialKey(keyId)) {
    return { minAttempts: Stats.MASTERY_MIN_ATTEMPTS, maxErr: Stats.MASTERY_MAX_ERR, speedMs: null, minLatSamples: 0 };
  }
  if (/^[0-9]$/.test(keyId) || isSymbolKey(keyId)) {
    // Lenient speed (location matters more than fluency, research/06) but still
    // speed-gated for real mastery. The Numbers round advances the *ramp* fast via a
    // separate accuracy-only check (rampReady) — this global gate is unchanged.
    return { minAttempts: 12, maxErr: Stats.MASTERY_MAX_ERR, speedMs: 600, minLatSamples: 4 };
  }
  return { minAttempts: Stats.MASTERY_MIN_ATTEMPTS, maxErr: Stats.MASTERY_MAX_ERR, speedMs: Stats.TARGET_MS, minLatSamples: Stats.MASTERY_MIN_LAT_SAMPLES };
}

// A symbol = a gate-able key that isn't a letter, digit, or special (e.g. ; , . / ! @).
function isSymbolKey(keyId) {
  return typeof keyId === 'string' && keyId.length === 1
    && !/^[a-zA-Z0-9]$/.test(keyId) && keyId !== ' ' && !isSpecialKey(keyId);
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

// Curriculum. Each stage ADDS items to the cumulative active pool. `caps` turns
// on occasional capitalization (which trains Shift + letter).
export const STAGES = [
  { label: 'Home row',        letters: 'asdfghjkl', symbols: [';'] },
  { label: 'Top row',         letters: 'qwertyuiop' },
  { label: 'Bottom row',      letters: 'zxcvbnm', symbols: [',', '.', '/'] },
  { label: 'Capitals',        caps: true, specials: ['Shift'] },
  { label: 'Numbers',         digits: '1234567890'.split('') },
  { label: 'Symbols',         symbols: ['-', '=', '[', ']', "'", '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', ':', '"', '?'] },
  { label: 'Special keys',    specials: ['Tab', 'Control', 'Alt', 'Meta'] },
];

// Build the cumulative pool for a given stage index (or the whole thing).
export function poolFor(stageIndex, all = false) {
  const pool = { letters: [], digits: [], symbols: [], specials: [], caps: false };
  const last = all ? STAGES.length - 1 : Math.min(stageIndex, STAGES.length - 1);
  for (let i = 0; i <= last; i++) {
    const s = STAGES[i];
    if (s.letters) pool.letters.push(...s.letters.split(''));
    if (s.digits) pool.digits.push(...s.digits);
    if (s.symbols) pool.symbols.push(...s.symbols.filter((x) => x in KEY_FINGER || SYMBOLS.includes(x)));
    if (s.specials) pool.specials.push(...s.specials);
    if (s.caps) pool.caps = true;
  }
  return pool;
}

const FLUENCY_MODES = new Set(['all', 'words', 'sentences']);
// Modes with no key-introduction curriculum → full keyboard, no target.
const FULL_POOL_MODES = new Set(['all', 'words', 'sentences', 'adaptive']);

export function activePool() {
  const st = Stats.getSettings();
  const c = st.levelChoice;
  if (FULL_POOL_MODES.has(c)) return poolFor(0, true);   // full pool
  if (c === 'auto') return poolFor(st.stage);
  return poolFor(parseInt(c, 10));          // a specific level index (cumulative)
}

// Keys introduced *at* a given stage (its own new keys).
export function stageKeys(index) {
  const s = STAGES[index] || {};
  const keys = [];
  if (s.letters) keys.push(...s.letters.split(''));
  if (s.digits) keys.push(...s.digits);
  if (s.symbols) keys.push(...s.symbols);
  if (s.specials) keys.push(...s.specials.filter((x) => x !== 'Shift'));
  return keys;
}

// When a specific level is picked, its own new keys are the "focus" and get a
// big emphasis boost so (e.g.) Numbers actually get drilled — still interleaved
// with easier keys from earlier levels. Returns a Set or null.
export function focusSet() {
  const c = Stats.getSettings().levelChoice;
  if (c === 'auto' || FULL_POOL_MODES.has(c)) return null;
  return new Set(stageKeys(parseInt(c, 10)));
}

// --- per-key mastery ----------------------------------------------------------

function isSpecialKey(keyId) {
  return SPECIAL_KEYS.some((s) => s.id === keyId);
}

// A key is mastered when, over its recent window, it clears its category's gate
// (letters: ~35 WPM/95%; numbers/symbols: accuracy-focused, lenient speed; specials:
// accuracy only). Sticky once achieved. See gateFor().
export function isMastered(keyId) {
  if (Stats.isMasteredFlag(keyId)) return true;
  const r = Stats.recentStats(keyId);
  const g = gateFor(keyId);
  const speedOk = g.speedMs == null || (r.latSamples >= g.minLatSamples && r.avgLat <= g.speedMs);
  return r.attempts >= g.minAttempts && r.errRate <= g.maxErr && speedOk;
}

// Continuous [0,1] mastery for the keyboard fill. Equals 1 exactly when this key's
// gate in isMastered() passes (each component clamps at 1 on its threshold).
export function confidence(keyId) {
  if (Stats.isMasteredFlag(keyId)) return 1;
  const r = Stats.recentStats(keyId);
  const g = gateFor(keyId);
  const evidence = Math.min(1, r.attempts / g.minAttempts);
  let speedScore;
  if (g.speedMs == null) speedScore = 1;
  else {
    const zero = g.speedMs + 357;   // latency at which speed score hits 0 (letters: 700)
    speedScore = r.latSamples >= 3 ? clamp01((zero - r.avgLat) / (zero - g.speedMs)) : 0;
  }
  const accScore = clamp01(((1 - r.errRate) - 0.80) / (0.95 - 0.80));
  return evidence * (0.5 * speedScore + 0.5 * accScore);
}

// Confidence for every key in the eligible (unlocked) pool — for the keyboard.
export function confidenceMap() {
  const pool = activePool();
  const ids = [...pool.letters, ...pool.digits, ...pool.symbols, ...pool.specials];
  const map = {};
  for (const id of ids) map[id] = confidence(id);
  return map;
}

// Canonical order in which keys are introduced (STAGES order, keys as listed).
function introductionOrder() {
  const st = Stats.getSettings();
  const c = st.levelChoice;
  if (FULL_POOL_MODES.has(c)) {
    const order = [];
    for (let i = 0; i < STAGES.length; i++) order.push(...stageKeys(i));
    return order;
  }
  if (c === 'auto') {
    const order = [];
    const last = Math.min(st.stage, STAGES.length - 1);
    for (let i = 0; i <= last; i++) order.push(...stageKeys(i));
    return order;
  }
  return stageKeys(parseInt(c, 10));
}

// The single un-mastered key currently being introduced (null in 'all' mode or
// when everything eligible is mastered).
export function targetKey() {
  if (FULL_POOL_MODES.has(Stats.getSettings().levelChoice)) return null;
  for (const k of introductionOrder()) if (!isMastered(k)) return k;
  return null;
}

// The pool to actually generate from: mastered keys (the interleave base) plus
// the current target, with a cold-start runway so early lines aren't too thin.
function drillPool(target) {
  const eligible = activePool();
  const ids = [...eligible.letters, ...eligible.digits, ...eligible.symbols, ...eligible.specials];
  const set = new Set();
  for (const id of ids) if (isMastered(id)) set.add(id);
  if (target) set.add(target);
  for (const id of ids) {                    // runway: fill up to MIN_DRILL in order
    if (set.size >= MIN_DRILL) break;
    set.add(id);
  }
  const pool = { letters: [], digits: [], symbols: [], specials: [], caps: eligible.caps };
  for (const id of eligible.letters) if (set.has(id)) pool.letters.push(id);
  for (const id of eligible.digits) if (set.has(id)) pool.digits.push(id);
  for (const id of eligible.symbols) if (set.has(id)) pool.symbols.push(id);
  for (const id of eligible.specials) if (set.has(id)) pool.specials.push(id);
  return pool;
}

function categoryOf(keyId, pool) {
  if (pool.digits.includes(keyId)) return 'digits';
  if (pool.symbols.includes(keyId)) return 'symbols';
  if (pool.specials.includes(keyId)) return 'specials';
  if (pool.letters.includes(keyId)) return 'letters';
  return null;
}

// --- weakness scoring ---------------------------------------------------------

// Higher = more in need of practice. A positive floor keeps mastered keys in the
// rotation so weak keys stay INTERLEAVED with easy ones.
export function weakness(keyId, focus = null) {
  const k = Stats.keyStat(keyId);
  const err = Stats.errorRate(keyId);
  const base = Stats.baselineLatency();
  const lat = Stats.avgLatency(keyId);
  const latFactor = lat > 0 ? lat / base : 1.3;          // unseen assumed a touch slow
  const normLat = Math.max(0, Math.min(2, latFactor - 1));
  const recency = Math.min(1, Stats.timesSinceSeen(keyId) / 120);
  const introBonus = k.attempts < 5 ? (5 - k.attempts) * 0.5 : 0;
  let w = 0.25 + 2.6 * err + 1.2 * normLat + 0.5 * recency + introBonus;
  if (focus && focus.has(keyId)) w *= 4;                 // picked-level keys dominate
  return w;
}

// --- key importance (usage frequency) ----------------------------------------
// Used to rank WHAT to work on, so a weak-but-rare key ('$') doesn't outrank a
// common one ('p'). Impact = weakness × importance. English letter frequencies (%);
// commas/periods weighted like common letters; other symbols/specials low. (research/08)
const LETTER_FREQ = {
  e: 12.7, t: 9.1, a: 8.2, o: 7.5, i: 7.0, n: 6.7, s: 6.3, h: 6.1, r: 6.0,
  d: 4.3, l: 4.0, c: 2.8, u: 2.8, m: 2.4, w: 2.4, f: 2.2, g: 2.0, y: 2.0,
  p: 1.9, b: 1.5, v: 0.98, k: 0.77, j: 0.15, x: 0.15, q: 0.095, z: 0.074,
};
const PUNCT_FREQ = { '.': 6.5, ',': 6.5, "'": 2.0, '-': 1.5, '"': 0.8, '?': 0.6, ';': 0.5, ':': 0.5, '!': 0.4, '/': 0.3 };
function importance(keyId) {
  const lower = /^[A-Z]$/.test(keyId) ? keyId.toLowerCase() : keyId;
  if (LETTER_FREQ[lower] != null) return LETTER_FREQ[lower];
  if (/^[0-9]$/.test(keyId)) return 1.2;      // digits: moderate
  if (PUNCT_FREQ[keyId] != null) return PUNCT_FREQ[keyId];
  if (isSpecialKey(keyId)) return 0.3;
  return 0.25;                                // other symbols ($ # @ % [ ] { } …)
}

export function impact(keyId) { return weakness(keyId) * importance(keyId); }

// --- frequency-normalized evidence window -------------------------------------
// RECENT_WINDOW is a count of ATTEMPTS, not a span of time, and letter frequency
// varies ~180x. At 30 attempts, 'e' is judged on ~80 seconds of typing while 'z' is
// judged on ~50 sessions — which is why focus keys churned. Scaling the window by
// usage frequency gives every key a comparable span (~FOCUS_SESSIONS sessions), so
// focus selection settles. Clamped at both ends: the extremes can't be evened out
// without unbounded memory, and the floor must leave room for ADAPT_MIN_ATTEMPTS.
const FOCUS_SESSIONS = 5;               // evidence should span ~this many sessions
const KEYSTROKES_PER_SESSION = 875;     // ~5 min at ~35 WPM (the settings default)
const FOCUS_WIN_MIN = 15;               // floor — must exceed ADAPT_MIN_ATTEMPTS (8)
const FOCUS_WIN_MAX = Stats.RECENT_MAX;

export function focusWindow(keyId) {
  const n = Math.round(importance(keyId) / 100 * KEYSTROKES_PER_SESSION * FOCUS_SESSIONS);
  return Math.min(FOCUS_WIN_MAX, Math.max(FOCUS_WIN_MIN, n));
}

// Weakest keys within the active pool, for summaries / stats views.
export function weakest(n = 8) {
  const pool = activePool();
  const ids = [...pool.letters, ...pool.digits, ...pool.symbols, ...pool.specials];
  return ids
    .filter((id) => Stats.keyStat(id).attempts > 0)
    .map((id) => ({ keyId: id, weakness: weakness(id),
      errorRate: Stats.errorRate(id), avgLatency: Stats.avgLatency(id) }))
    .sort((a, b) => impact(b.keyId) - impact(a.keyId))   // impact = weakness × usage frequency
    .slice(0, n);
}

// --- breadth-aware weighted sampling ------------------------------------------

// Picks keys by weakness while actively spreading coverage: a decaying "recently
// used" penalty plus a hard no-immediate-repeat rule.
function makeSampler(keys, focus = null, target = null) {
  const recent = new Map();
  let last = null;
  const bump = (chosen) => {
    for (const [k, v] of recent) recent.set(k, v * 0.55);
    recent.set(chosen, (recent.get(chosen) || 0) + 1);
    last = chosen;
    return chosen;
  };
  return {
    pick(prefer) {
      // Forced target: drill the key being introduced ~TARGET_PICK_P of the time,
      // but never twice running — spaced concentration (overlearning), not massing.
      // It bypasses the recent-penalty, which would otherwise rotate away from it.
      if (target && keys.includes(target) && last !== target && pseudoRandom() < TARGET_PICK_P) {
        return bump(target);
      }
      // Weighted pick over everything except the target (it has its own path).
      let candidates = target ? keys.filter((k) => k !== target) : keys.slice();
      if (!candidates.length) candidates = keys.slice();
      if (candidates.length > 1 && last !== null) {
        const noLast = candidates.filter((k) => k !== last);
        if (noLast.length) candidates = noLast;
      }
      const weights = candidates.map((k) => {
        let w = weakness(k, focus);
        if (prefer && prefer(k)) w *= 1.8;          // e.g. bias toward vowels/consonants
        const r = recent.get(k) || 0;
        return w / (1 + 1.8 * r);                    // breadth: suppress just-used keys
      });
      return bump(weightedIndex(candidates, weights));
    },
  };
}

function weightedIndex(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[items.length - 1];
  let r = pseudoRandom() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// Local RNG wrapper so the one place we need randomness is easy to find/seed.
function pseudoRandom() { return Math.random(); }

// --- token construction -------------------------------------------------------

function charToken(ch) {
  return {
    type: 'char',
    display: ch,
    expected: ch,
    keyId: ch,
    needsShift: needsShift(ch),
    shiftSide: whichShift(ch),
  };
}

function specialToken(id) {
  const meta = SPECIAL_KEYS.find((s) => s.id === id) || { id, label: id };
  return { type: 'special', display: meta.label, expected: id, keyId: id, needsShift: false };
}

// A short, typeable letter cluster (2–4 letters), alternating consonant/vowel
// when the pool allows, with optional capitalization.
function letterCluster(sampler, letters, allowCaps) {
  const hasVowel = letters.some((l) => VOWELS.has(l));
  const len = 2 + Math.floor(pseudoRandom() * 3); // 2..4
  const out = [];
  let wantVowel = pseudoRandom() < 0.5;
  for (let i = 0; i < len; i++) {
    let ch;
    if (hasVowel) {
      ch = sampler.pick((k) => (wantVowel ? VOWELS.has(k) : !VOWELS.has(k)));
    } else {
      ch = sampler.pick(null);
    }
    wantVowel = !VOWELS.has(ch); // aim to alternate next time
    out.push(ch);
  }
  let cluster = out;
  if (allowCaps && pseudoRandom() < 0.35) {
    cluster = [...out];
    cluster[0] = cluster[0].toUpperCase();
  }
  return cluster.map(charToken);
}

// Evenly spread `count` copies of `label` across the returned slot order.
function interleaveSlots(counts) {
  // counts: { category: n }. Returns an ordered array of category labels that
  // spaces each category as evenly as possible (largest-remainder round robin).
  const cats = Object.keys(counts).filter((c) => counts[c] > 0);
  const total = cats.reduce((a, c) => a + counts[c], 0);
  const acc = Object.fromEntries(cats.map((c) => [c, 0]));
  const order = [];
  for (let i = 0; i < total; i++) {
    let best = null; let bestVal = -Infinity;
    for (const c of cats) {
      if (acc[c] >= counts[c]) continue;
      const val = (acc[c] + 1) / (counts[c] + 1); // how "behind" this cat is
      if (-val > bestVal) { bestVal = -val; best = c; }
    }
    order.push(best);
    acc[best] += 1;
  }
  return order;
}

// --- words → sentences fluency phase ------------------------------------------
// The letters *material* graduates from pseudoword clusters (acquisition) to real
// words then sentences (transfer/chunking) as mastery accrues — see research/05.

let recentWords = new Map();     // word -> decaying use count (breadth across the list)
let lastWord = null;
let recentSentences = [];        // no-repeat window
let lastMaterial = null;         // for the {type:'material'} notification

function masteredLetterSet() {
  return new Set(activePool().letters.filter((l) => isMastered(l)));
}

function allPoolLettersMastered() {
  const pool = activePool();
  return pool.letters.length > 0 && pool.letters.every((l) => isMastered(l));
}

function sentencesReady() {
  const pool = activePool();
  // NB: test pool.caps, NOT isMastered('Shift') — Shift is never gated.
  return allPoolLettersMastered() && pool.caps && isMastered('.') && isMastered(',');
}

// 'clusters' (acquisition) | 'words' | 'sentences' — a pure function of mastery state.
export function materialLevel() {
  if (!allPoolLettersMastered()) return 'clusters';
  if (Words.eligibleWords(masteredLetterSet()).length < MIN_ELIGIBLE_WORDS) return 'clusters';
  if (sentencesReady() && eligibleSentences().length >= MIN_ELIGIBLE_SENTENCES) return 'sentences';
  return 'words';
}

// Which letters real words may use. Explicit Words/Sentences modes are PERMISSIVE
// (the whole alphabet — the user chose a fluency mode, so show real words even
// before mastery); the automatic terminal-fluency path uses only mastered letters.
function fluencyLetterSet() {
  const lc = Stats.getSettings().levelChoice;
  if (lc === 'words' || lc === 'sentences' || lc === 'adaptive' || RAMP_LEVELS[lc]) return new Set(activePool().letters);
  return masteredLetterSet();
}

function weakestOf(letterSet) {
  let best = null; let bestW = -Infinity;
  for (const l of letterSet) { const w = weakness(l); if (w > bestW) { bestW = w; best = l; } }
  return best;
}

function scoreWord(word, rank, nWords, weakSet /* Set<letter> | null */) {
  const uniq = [...new Set(word)];
  let w = uniq.reduce((a, ch) => a + weakness(ch), 0) / uniq.length;   // mean letter weakness
  w *= 1 + FREQ_WEIGHT * (1 - rank / nWords);                          // favor common words
  if (weakSet && weakSet.size) {                                       // boost per weak-key hit (cap 2 hits)
    let hits = 0;
    for (const l of weakSet) if (word.includes(l)) hits += 1;
    if (hits) w *= Math.min(WEAK_WORD_BOOST ** hits, WEAK_WORD_BOOST ** 2);
  }
  const r = recentWords.get(word) || 0;
  return w / (1 + RECENT_WORD_PENALTY * r);                            // breadth
}

function pickWord(eligible, weakSet) {
  let candidates = eligible;
  if (eligible.length > 1 && lastWord) {
    const noLast = eligible.filter((w) => w !== lastWord);
    if (noLast.length) candidates = noLast;
  }
  const rankOf = new Map(eligible.map((w, i) => [w, i]));   // freq rank = position
  const weights = candidates.map((w) => scoreWord(w, rankOf.get(w), eligible.length, weakSet));
  const chosen = weightedIndex(candidates, weights);
  for (const [k, v] of recentWords) recentWords.set(k, v * RECENT_WORD_DECAY);
  recentWords.set(chosen, (recentWords.get(chosen) || 0) + 1);
  lastWord = chosen;
  return chosen;
}

function wordTokens(word, allowCaps) {
  const chars = (allowCaps && pseudoRandom() < CAPS_WORD_P)
    ? [word[0].toUpperCase(), ...word.slice(1)] : [...word];
  return chars.map(charToken);
}

function wordLine(targetChars = WORD_LINE_TARGET_CHARS, weakSet = null) {
  const allowed = fluencyLetterSet();
  const eligible = Words.eligibleWords(allowed);
  const caps = activePool().caps;
  const w0 = weakestOf(allowed);
  const weak = weakSet ?? (w0 ? new Set([w0]) : null);   // default: single weakest letter (legacy behavior)
  const tokens = [];
  let chars = 0; let n = 0;
  while (chars < targetChars && n < WORD_LINE_MAX_WORDS) {
    const w = pickWord(eligible, weak);
    tokens.push(...wordTokens(w, caps), spaceToken());
    chars += w.length + 1; n += 1;
  }
  while (tokens.length && tokens[tokens.length - 1].type === 'space') tokens.pop();
  return tokens;
}

// --- sentences (drawn verbatim from the bundled corpus, filtered to typeable keys) ---

// requireMastery=false (explicit Sentences mode) → only checks the char is a key
// in the pool, not that it's mastered, so real sentences show up right away.
function charTypeable(ch, pool, requireMastery) {
  if (ch === ' ') return true;
  const m = (id) => !requireMastery || isMastered(id);
  if (/[a-z]/.test(ch)) return pool.letters.includes(ch) && m(ch);
  if (/[A-Z]/.test(ch)) return pool.caps && m(ch.toLowerCase());  // NOT isMastered('Shift')
  if (/[0-9]/.test(ch)) return pool.digits.includes(ch) && m(ch);
  return pool.symbols.includes(ch) && m(ch);   // '.', ',', '!', '?', "'" etc. are per-char keyIds
}

function sentenceEligible(s, pool, requireMastery) {
  return [...s].every((ch) => charTypeable(ch, pool, requireMastery));
}

function eligibleSentences(requireMastery = true) {
  const pool = activePool();
  return Words.SENTENCES.filter((s) => sentenceEligible(s, pool, requireMastery));
}

function sentenceTokens(s) {
  return [...s].map((ch) => (ch === ' ' ? spaceToken() : charToken(ch)));
}

function uniqueBaseChars(s) {
  const set = new Set();
  for (const ch of s) {
    if (ch === ' ') continue;
    set.add(/[A-Z]/.test(ch) ? ch.toLowerCase() : ch);
  }
  return [...set];
}

function sentenceLine(requireMastery = true) {
  const pool = activePool();
  let candidates = Words.SENTENCES.filter((s) => sentenceEligible(s, pool, requireMastery) && !recentSentences.includes(s));
  if (!candidates.length) candidates = eligibleSentences(requireMastery);
  if (!candidates.length) return null;
  const weights = candidates.map((s) => {
    const chars = uniqueBaseChars(s);
    return chars.length ? chars.reduce((a, ch) => a + weakness(ch), 0) / chars.length : 0.01;
  });
  const s = weightedIndex(candidates, weights);
  recentSentences.push(s);
  if (recentSentences.length > SENTENCE_NO_REPEAT) recentSentences.shift();
  return sentenceTokens(s);
}

// --- content-first adaptive mode ----------------------------------------------
// Type real words/sentences; the engine finds the ≤ADAPT_FOCUS_N keys you're
// actually shaky on and drills THOSE (weak-key-biased words + targeted bursts for
// keys words can't cover), without re-drilling keys you're already fine on.

let adaptLineNo = 0;
let burstRotation = 0;
let probeRotation = 0;
let sessionKeySnapshot = null;   // keyId -> {attempts, errRate, avgLat} at session start (for the summary)
let _letterWordCount = null;     // letter -> # corpus words containing it (static, lazy)
let lastRampActive = null;       // for the {type:'rampAdvance'} notification

// The current deliberate-acquisition ramp, derived purely from mastery state
// (nothing persisted). Tracks run sequentially — digits → symbols → specials —
// so at most RAMP_ACTIVE_N keys are being introduced at once, over-exposed inside
// words until each masters. Returns null in non-adaptive modes / when all mastered.
// → { track, active:[…], next:string|null, pending:Set }
// Fast advancement check for the Numbers round: accuracy/location only (no speed),
// so the next number comes in quickly. Full speed-based mastery (gateFor) is separate.
function rampReady(k) {
  // Incorporation is EXPOSURE-based: a few reps and you're getting it more often
  // than not → bring in the next number. Learning errors must NOT block progress
  // (the digit stays in the `introduced` pool and keeps being practiced). Full
  // accuracy/speed is the separate isMastered gate, not this.
  const r = Stats.recentStats(k);
  return r.attempts >= 4 && r.errRate <= 0.5;
}

// The deliberate rounds: '4' → Numbers (digits, ~1:2), '6' → Special keys
// (Tab/Ctrl/Alt/Meta, ~1:4, disruptive so lighter). Progressive introduction: `active`
// = the ones being introduced now; `introduced` = the accumulating pool (all appear,
// woven in words). Null in every other mode (Adaptive gets only a light sprinkle).
const RAMP_LEVELS = {
  3: { track: 'caps', order: RAMP_CAPS, label: 'Capitals' },
  4: { track: 'digits', order: RAMP_DIGITS, label: 'Numbers' },
  5: { track: 'symbols', order: RAMP_SYMBOLS, label: 'Symbols' },
  6: { track: 'specials', order: RAMP_SPECIALS, label: 'Special keys' },
};
export function acquisitionRamp() {
  const cfg = RAMP_LEVELS[Stats.getSettings().levelChoice];
  if (!cfg) return null;
  const { track, order } = cfg;
  const n = RAMP_ACTIVE_N[track];
  const notReady = order.filter((k) => !rampReady(k));
  const active = notReady.length ? notReady.slice(0, n) : order.slice(-n);
  const introduced = order.filter((k) => rampReady(k) || active.includes(k));
  return { track, active, introduced, next: notReady[n] ?? null, pending: new Set(notReady) };
}

// { focus: string[] (≤N, weakest first — enough data & measures weak),
//   probes: string[] (too little recent data, or a stale digit/symbol) }
// Keys the ramp is currently introducing are filtered out — they're over-exposed
// already and must not eat focus slots or double-fire as probes.
export function adaptiveFocus(ramp = acquisitionRamp()) {
  const pool = activePool();
  const ids = [...pool.letters, ...pool.digits, ...pool.symbols];  // NOT specials — they wreck flow
  const base = Stats.baselineLatency();
  const rampPending = ramp?.pending ?? new Set();
  const focus = []; const probes = [];
  for (const id of ids) {
    if (rampPending.has(id)) continue;
    const r = Stats.recentStats(id, focusWindow(id));   // ~5 sessions, not ~80 seconds
    const isLetter = /^[a-z]$/.test(id);
    const stale = !isLetter && Stats.timesSinceSeen(id) > ADAPT_STALE;
    if (r.attempts < ADAPT_MIN_ATTEMPTS || stale) { probes.push(id); continue; }
    const slow = r.latSamples >= 3 && r.avgLat >= ADAPT_LAT_WEAK * base;
    if (r.errRate >= ADAPT_ERR_WEAK || slow) focus.push(id);
  }
  focus.sort((a, b) => impact(b) - impact(a));   // rank by weakness × usage frequency
  return { focus: focus.slice(0, ADAPT_FOCUS_N), probes };
}

function wordCoverage(letter) {
  if (!_letterWordCount) {
    _letterWordCount = new Map();
    for (const w of Words.WORDS) for (const ch of new Set(w)) _letterWordCount.set(ch, (_letterWordCount.get(ch) || 0) + 1);
  }
  return _letterWordCount.get(letter) || 0;
}

// The key (if any) to drill with a burst this line — focus keys words can't cover
// first, then coverage probes, on their respective cadences.
function pickBurstKey(focus, probes) {
  const needsBurst = focus.filter((k) => !/^[a-z]$/.test(k) || wordCoverage(k) < MIN_FOCUS_WORDS);
  if (needsBurst.length && adaptLineNo % DRILL_EVERY === 0) return needsBurst[burstRotation++ % needsBurst.length];
  if (probes.length && adaptLineNo % PROBE_EVERY === 0) return probes[probeRotation++ % probes.length];
  return null;
}

// A short (4–7 token) spaced drill of one key, interleaved with companions so it
// isn't massed.
function burstTokens(keyId) {
  const pool = activePool();
  if (/^[a-z]$/.test(keyId)) {
    const sampler = makeSampler(pool.letters, null, keyId);
    return [...letterCluster(sampler, pool.letters, false), spaceToken(),
      ...letterCluster(sampler, pool.letters, false)];
  }
  const cat = pool.digits.includes(keyId) ? pool.digits : pool.symbols;
  const companions = cat.filter((k) => k !== keyId && Stats.keyStat(k).attempts > 0).slice(0, 4);
  const sampler = makeSampler([keyId, ...companions], null, keyId);
  const out = [];
  for (let i = 0; i < 3; i++) { if (i) out.push(spaceToken()); out.push(charToken(sampler.pick(null))); }
  return out;
}

function spliceAtSpace(tokens, burst) {
  let best = -1; const mid = tokens.length / 2;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'space' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  if (best < 0) { tokens.push(spaceToken(), ...burst); return; }
  tokens.splice(best + 1, 0, ...burst, spaceToken());
}

// A short chunk (2–3) drawn from the accumulating introduced-digit pool (weighted
// by weakness, so the newest/weakest appear most) — earlier numbers keep getting
// practiced as new ones come in.
function rampChunkTokens(ramp) {
  const pool = ramp.introduced && ramp.introduced.length ? ramp.introduced : ramp.active;
  const sampler = makeSampler(pool, null, null);
  const len = RAMP_CHUNK_MIN + Math.floor(pseudoRandom() * (RAMP_CHUNK_MAX - RAMP_CHUNK_MIN + 1));
  const out = [];
  for (let i = 0; i < len; i++) out.push(charToken(sampler.pick(null)));
  return out;
}

// A word line with the active ramp keys woven through at high density — real words
// stay the carrier (~70% of chars) and weak letters still get word-bias.
function rampWordLine(ramp, weak) {
  const allowed = fluencyLetterSet();
  const eligible = Words.eligibleWords(allowed);
  const caps = activePool().caps;
  const { injectP, maxHits, minHits } = RAMP_TRACK[ramp.track];
  const specialPool = () => (ramp.introduced.length ? ramp.introduced : ramp.active);
  const tokens = [];
  let chars = 0; let n = 0; let hits = 0;
  while (chars < WORD_LINE_TARGET_CHARS && n < WORD_LINE_MAX_WORDS) {
    const word = pickWord(eligible, weak);
    tokens.push(...wordTokens(word, caps));
    chars += word.length; n += 1;
    if (hits < maxHits && pseudoRandom() < injectP) {
      if (ramp.track === 'specials') {
        const p = specialPool();
        tokens.push(spaceToken(), specialToken(p[Math.floor(pseudoRandom() * p.length)]));
        hits += 1; chars += 2;
      } else if (ramp.track === 'symbols'
          && RAMP_TRAIL_SYMBOLS.has(ramp.active[Math.floor(pseudoRandom() * ramp.active.length)])) {
        // trailing punctuation reads naturally attached to the word (house, plan?)
        const sym = ramp.active.filter((s) => RAMP_TRAIL_SYMBOLS.has(s));
        tokens.push(charToken(sym[Math.floor(pseudoRandom() * sym.length)])); hits += 1; chars += 1;
      } else {
        const chunk = rampChunkTokens(ramp);          // standalone digit/symbol chunk
        tokens.push(spaceToken(), ...chunk); hits += chunk.length; chars += chunk.length + 1;
      }
    }
    tokens.push(spaceToken());
  }
  if (hits < minHits) {                               // guarantee real practice every ramp line
    if (ramp.track === 'specials') { const p = specialPool(); tokens.push(specialToken(p[0]), spaceToken()); }
    else tokens.push(...rampChunkTokens(ramp), spaceToken());
  }
  while (tokens.length && tokens[tokens.length - 1].type === 'space') tokens.pop();
  return tokens;
}

// Light sprinkle: occasionally weave one number into an adaptive word line, so
// adaptive practice has a few numbers without being number-heavy (that's the
// Numbers round's job). Weakness-weighted so a shaky digit shows a touch more.
function sprinkleDigits(tokens) {
  const digits = activePool().digits;
  if (!digits.length || pseudoRandom() >= ADAPT_SPRINKLE_P) return;
  const sampler = makeSampler(digits, null, null);
  const chunk = [charToken(sampler.pick(null))];
  if (pseudoRandom() < 0.3) chunk.push(charToken(sampler.pick(null)));   // occasionally two
  spliceAtSpace(tokens, chunk);
}

// Capitals round: heavily Title-Case real words, capitalizing initials whose
// uppercase is in the introduced set (progressive) — ~1 capital per word.
function capsWordLine(ramp) {
  const allowed = new Set(activePool().letters);
  const eligible = Words.eligibleWords(allowed);
  const introInitials = new Set(ramp.introduced.map((c) => c.toLowerCase()));
  const capWords = eligible.filter((w) => introInitials.has(w[0]));
  const pool = capWords.length >= 8 ? capWords : eligible;   // fallback if too few
  const tokens = [];
  let chars = 0; let n = 0;
  while (chars < WORD_LINE_TARGET_CHARS && n < WORD_LINE_MAX_WORDS) {
    const w = pickWord(pool, null);
    const glyphs = introInitials.has(w[0]) ? [w[0].toUpperCase(), ...w.slice(1)] : [...w];
    tokens.push(...glyphs.map(charToken), spaceToken());
    chars += w.length + 1; n += 1;
  }
  while (tokens.length && tokens[tokens.length - 1].type === 'space') tokens.pop();
  return tokens;
}

function adaptiveLine() {
  adaptLineNo += 1;
  const { focus, probes } = adaptiveFocus();
  const letterFocus = new Set(focus.filter((k) => /^[a-z]$/.test(k)));
  const weak = letterFocus.size ? letterFocus : null;

  const burstKey = pickBurstKey(focus, probes);
  if (!burstKey && pseudoRandom() < ADAPT_SENTENCE_P) {
    const s = sentenceLine(false);
    if (s) return s;
  }
  const targetChars = burstKey ? WORD_LINE_TARGET_CHARS - BURST_TRIM : WORD_LINE_TARGET_CHARS;
  const tokens = wordLine(targetChars, weak);
  if (burstKey) spliceAtSpace(tokens, burstTokens(burstKey));
  else sprinkleDigits(tokens);
  return tokens;
}

// Build one practice line (~12 slots) from the active pool.
export function generateLine() {
  const lc = Stats.getSettings().levelChoice;

  if (lc === 'adaptive') return adaptiveLine();
  if (lc === 'shortcuts') return Shortcuts.shortcutLine();

  // Capitals ('3') / Numbers ('4') / Symbols ('5') / Special keys ('6') → deliberate rounds.
  if (RAMP_LEVELS[lc]) {
    const nr = acquisitionRamp();
    if (nr) return nr.track === 'caps' ? capsWordLine(nr) : rampWordLine(nr, null);
  }

  // Explicit fluency modes (manual level select): the user chose Words/Sentences,
  // so ALWAYS render real material using the whole alphabet — never fall back to
  // pseudoword clusters. (fluencyLetterSet() / requireMastery=false make these
  // permissive; adaptive weakness weighting still applies.)
  if (lc === 'sentences') {
    const s = sentenceLine(false);
    if (s) return s;                 // else fall through to words
  }
  if (lc === 'words' || lc === 'sentences') {
    return wordLine();               // full alphabet → always ≥ MIN_ELIGIBLE_WORDS
  }

  const target = targetKey();

  // Terminal fluency in auto / '<n>' / 'all': no target left and words available →
  // mix sentence / word / occasional classic mixed lines (keeps digits/symbols alive).
  if (target === null && materialLevel() !== 'clusters') {
    const mat = materialLevel();
    if (pseudoRandom() >= MIXED_LINE_P) {
      if (mat === 'sentences' && pseudoRandom() < SENTENCE_LINE_P) {
        const s = sentenceLine(true);
        if (s) return s;
      }
      return wordLine();
    }
    // else fall through to a classic mixed line (with a words backbone, below)
  }

  const pool = (!FLUENCY_MODES.has(lc) && target !== null)
    ? drillPool(target) : activePool();
  const focus = focusSet();
  const letterSampler = pool.letters.length ? makeSampler(pool.letters, focus, target) : null;
  const digitSampler = pool.digits.length ? makeSampler(pool.digits, focus, target) : null;
  const symbolSampler = pool.symbols.length ? makeSampler(pool.symbols, focus, target) : null;
  const specialSampler = pool.specials.filter((s) => s !== 'Shift');
  const specialRot = specialSampler.length ? makeSampler(specialSampler, focus, target) : null;

  // Slot allocation. Letters are the backbone; other categories get slots in
  // proportion to how much practice they need (their summed weakness), capped so
  // they never swamp the line — but always at least 1 slot if present.
  const SLOTS = 12;
  const pressure = (keys) => keys.reduce((a, k) => a + weakness(k, focus), 0);
  const raw = {};
  if (letterSampler) raw.letters = Math.max(pressure(pool.letters), 0.01) * 1.6 + 3;
  if (digitSampler) raw.digits = pressure(pool.digits);
  if (symbolSampler) raw.symbols = pressure(pool.symbols);
  if (specialRot) raw.specials = pressure(specialSampler) * 0.8;

  const totalRaw = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  const counts = {};
  for (const cat of Object.keys(raw)) {
    counts[cat] = Math.max(1, Math.round((raw[cat] / totalRaw) * SLOTS));
  }
  // Keep a backbone of letter slots so lines stay typeable, but give a focused
  // level more room for its category (min 3 letter slots vs 4 normally).
  if (counts.letters !== undefined) {
    const minLetters = focus ? 3 : 4;
    const others = Object.keys(counts).filter((c) => c !== 'letters')
      .reduce((a, c) => a + counts[c], 0);
    if (others > SLOTS - minLetters) {
      const scale = (SLOTS - minLetters) / others;
      for (const c of Object.keys(counts)) {
        if (c !== 'letters') counts[c] = Math.max(1, Math.round(counts[c] * scale));
      }
    }
  }

  // Guarantee the key being introduced gets enough reps per line even when its
  // category (a lone new digit/symbol/special) would otherwise get ~1 slot.
  if (target) {
    const cat = categoryOf(target, pool);
    if (cat && cat !== 'letters' && counts[cat] !== undefined) {
      counts[cat] = Math.max(counts[cat], MIN_TARGET_CAT_SLOTS);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      if (total > SLOTS && counts.letters) {   // borrow from the letter backbone
        counts.letters = Math.max(1, counts.letters - (total - SLOTS));
      }
    }
  }

  // Past the clusters phase, the letters backbone of a mixed line renders as real
  // (length-capped) words instead of pseudoword clusters — words are the transfer
  // material while digits/symbols/specials acquisition continues around them.
  const useWords = materialLevel() !== 'clusters';
  const shortWords = useWords
    ? Words.eligibleWords(masteredLetterSet()).filter((w) => w.length <= MAX_WORD_LEN_MIXED)
    : null;
  const wordsForLetters = useWords && shortWords.length >= MIN_ELIGIBLE_WORDS;
  const sw = wordsForLetters ? weakestOf(masteredLetterSet()) : null;
  const shortWeakSet = sw ? new Set([sw]) : null;

  const order = interleaveSlots(counts);
  const tokens = [];
  for (const cat of order) {
    if (cat === 'letters') {
      tokens.push(...(wordsForLetters
        ? wordTokens(pickWord(shortWords, shortWeakSet), pool.caps)
        : letterCluster(letterSampler, pool.letters, pool.caps)));
    }
    else if (cat === 'digits') tokens.push(charToken(digitSampler.pick(null)));
    else if (cat === 'symbols') tokens.push(charToken(symbolSampler.pick(null)));
    else if (cat === 'specials') tokens.push(specialToken(specialRot.pick(null)));
    tokens.push(spaceToken());
  }
  // drop a trailing space
  while (tokens.length && tokens[tokens.length - 1].type === 'space') tokens.pop();
  return tokens;
}

function spaceToken() {
  return { type: 'space', display: '␣', expected: ' ', keyId: ' ', needsShift: false };
}

// --- stage progression --------------------------------------------------------

// Ready to advance when every key the current stage introduced is individually
// MASTERED (speed + accuracy over its recent window), not merely accurate.
export function canAdvanceStage() {
  const st = Stats.getSettings();
  if (st.stage >= STAGES.length - 1) return false;
  const keys = stageKeys(st.stage);
  if (!keys.length) return true; // e.g. a caps-only stage
  return keys.every((k) => isMastered(k));
}

// Advance if ready — only in auto mode. Returns the new stage label, or null.
export function maybeAdvanceStage() {
  const st = Stats.getSettings();
  if (st.levelChoice !== 'auto') return null;   // manual level: don't auto-advance
  if (canAdvanceStage()) {
    Stats.setSetting('stage', st.stage + 1);
    return STAGES[st.stage].label;
  }
  return null;
}

// --- progression events + ETA (called once per line from app.js) --------------

let lastAnnouncedTarget = null;
let paceSnapshots = [];   // { t, a } wall-time + target attempts; in-memory only
let etaSmoothed = null;
let trackingStartCounter = 0;   // seenCounter at session start; for "mastered this session"

// Reset per-target tracking at session start (and whenever the target changes).
export function startTracking() {
  lastAnnouncedTarget = null;
  paceSnapshots = [];
  etaSmoothed = null;
  trackingStartCounter = Stats.seenCounter();
  lastMaterial = materialLevel();   // seed so no spurious 'material' notice at session start
  recentWords = new Map();
  lastWord = null;
  recentSentences = [];
  adaptLineNo = 0; burstRotation = 0; probeRotation = 0;
  lastRampActive = acquisitionRamp()?.active.join(' ') ?? '';   // seed: no spurious ramp notice
  Shortcuts.startTracking();
  // Per-key snapshot so the adaptive summary can report which keys improved.
  sessionKeySnapshot = {};
  for (const id of Object.keys(Stats.getState().keys)) {
    const r = Stats.recentStats(id);
    if (r.attempts) sessionKeySnapshot[id] = { attempts: Stats.keyStat(id).attempts, errRate: r.errRate, avgLat: r.avgLat };
  }
}

function resetPace() {
  paceSnapshots = [];
  etaSmoothed = null;
}

// Detect graduations / level-ups / new targets since the last call. Returns an
// event list the UI turns into notifications: {type:'mastered'|'levelUp'|'newTarget', ...}.
export function checkProgress() {
  const events = [];
  const lc = Stats.getSettings().levelChoice;
  if (lc === 'shortcuts') return Shortcuts.checkProgress();
  const adaptive = lc === 'adaptive';
  const rampRound = !!RAMP_LEVELS[lc];   // Numbers / Symbols / Special-keys deliberate rounds

  // Mastery marking runs in every non-fluency mode — a key that crosses its gate
  // still earns a "mastered" toast.
  if (!FLUENCY_MODES.has(lc)) {
    for (const k of introductionOrder()) {
      if (!Stats.isMasteredFlag(k) && isMastered(k)) {
        Stats.markMastered(k);
        events.push({ type: 'mastered', keyId: k });
      }
    }
    // Ramp round advanced to the next key(s).
    if (rampRound) {
      const r = acquisitionRamp();
      const activeStr = r ? r.active.join(' ') : '';
      if (lastRampActive !== null && activeStr && activeStr !== lastRampActive) {
        events.push({ type: 'rampAdvance', active: r.active });
      }
      lastRampActive = activeStr;
    }
    // Curriculum progression (targets / level-ups) is the Beginner-course path only.
    if (!adaptive && !rampRound) {
      if (lc === 'auto') {
        const label = maybeAdvanceStage();
        if (label) events.push({ type: 'levelUp', label, nextLabel: STAGES[Stats.getSettings().stage]?.label });
      }
      const target = targetKey();
      if (target && target !== lastAnnouncedTarget) {
        events.push({ type: 'newTarget', keyId: target });
        lastAnnouncedTarget = target;
        resetPace();
      }
    }
  }

  // Material-level promotion (auto/levels only — not adaptive or a ramp round).
  if (!adaptive && !rampRound) {
    const mat = materialLevel();
    if (mat !== lastMaterial) {
      const rank = { clusters: 0, words: 1, sentences: 2 };
      if (lastMaterial !== null && rank[mat] > rank[lastMaterial]) events.push({ type: 'material', level: mat });
      lastMaterial = mat;
    }
  }
  return events;
}

// Rough "time until the next key unlocks" from remaining reps ÷ measured pace.
// Deliberately coarse (learning curves aren't linear) — the UI quantizes it.
export function nextKeyEta() {
  const st = Stats.getSettings();
  const target = targetKey();
  if (!target || st.levelChoice === 'all') return { minutes: null, keyId: null, measuring: false };
  const r = Stats.recentStats(target);
  const special = isSpecialKey(target);

  const repsEvidence = Math.max(0, Stats.MASTERY_MIN_ATTEMPTS - r.attempts);
  let repsSpeed = 0;
  if (!special) {
    if (r.avgLat > Stats.TARGET_MS) {
      const last10 = r.lats.slice(-10);
      const l10 = last10.length ? last10.reduce((a, b) => a + b, 0) / last10.length : r.avgLat;
      // reps of fresh keystrokes (at recent pace l10) to pull the window avg under target
      repsSpeed = l10 < r.avgLat
        ? Math.ceil(Stats.RECENT_WINDOW * (r.avgLat - Stats.TARGET_MS) / (r.avgLat - l10))
        : 60; // not improving — pessimistic placeholder
      repsSpeed = Math.max(0, Math.min(120, repsSpeed));
    }
    if (r.latSamples < Stats.MASTERY_MIN_LAT_SAMPLES) {
      repsSpeed = Math.max(repsSpeed, Stats.MASTERY_MIN_LAT_SAMPLES - r.latSamples);
    }
  }
  let repsAcc = 0;
  if (r.errRate > Stats.MASTERY_MAX_ERR) {
    const allowed = Math.floor(Stats.RECENT_WINDOW * Stats.MASTERY_MAX_ERR); // ~1 error tolerated
    repsAcc = Math.max(0, (r.errors - allowed) * 5);                   // each surplus error ≈ 5 clean reps to age out
  }
  const repsNeeded = Math.max(repsEvidence, repsSpeed, repsAcc);
  if (repsNeeded <= 0) return { minutes: 0, keyId: target, measuring: false };

  const now = Date.now();
  const attemptsNow = Stats.keyStat(target).attempts;
  const lastSnap = paceSnapshots[paceSnapshots.length - 1];
  if (!lastSnap || now - lastSnap.t >= 1000) paceSnapshots.push({ t: now, a: attemptsNow });
  paceSnapshots = paceSnapshots.filter((s) => now - s.t <= 90000);
  const oldest = paceSnapshots[0];
  if (!oldest || now - oldest.t < 15000 || attemptsNow - oldest.a <= 0) {
    return { minutes: null, keyId: target, measuring: true };
  }
  const pace = (attemptsNow - oldest.a) / ((now - oldest.t) / 60000);  // target reps/min
  const etaRaw = repsNeeded / Math.max(pace, 1);
  etaSmoothed = etaSmoothed == null ? etaRaw : 0.6 * etaSmoothed + 0.4 * etaRaw;
  return { minutes: etaSmoothed, keyId: target, measuring: false };
}

// --- progress views (for end-of-session summary + the panel) ------------------

// Keys that crossed the mastery gate during the current session, in canonical order.
export function keysMasteredThisSession() {
  // Strict '>': within a session, keystrokes advance seenCounter past the start
  // snapshot before any key can be marked, so masteredAt > start ⇔ mastered now.
  return introductionOrder().filter((k) => {
    const s = Stats.keyStat(k);
    return s.mastered && s.masteredAt > trackingStartCounter;
  });
}

// All mastered keys in the eligible pool, canonical order — the positive
// counterpart to the "keys to focus on" list.
export function masteredKeys() {
  return introductionOrder().filter((k) => isMastered(k));
}

// How far through the current mode's gate-able keys the learner is.
export function masteryProgress() {
  const order = introductionOrder();
  return { mastered: order.filter((k) => isMastered(k)).length, total: order.length };
}

// Keys that measurably improved this session (for the adaptive summary). Compares
// each key's recent-window error/latency now vs. the snapshot taken at session start.
export function sessionKeyDeltas(minReps = 6) {
  if (!sessionKeySnapshot) return [];
  const out = [];
  for (const [id, snap] of Object.entries(sessionKeySnapshot)) {
    if (Stats.keyStat(id).attempts - snap.attempts < minReps) continue;
    const r = Stats.recentStats(id);
    const errDelta = snap.errRate - r.errRate;                   // + = fewer errors now
    const latDelta = snap.avgLat - r.avgLat;                     // + = faster now (ms)
    const score = errDelta * 3 + Math.max(-1, Math.min(1, latDelta / 300));
    if (score > 0.15) out.push({ keyId: id, errDelta, latDelta, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

export function stageLabel() {
  const c = Stats.getSettings().levelChoice;
  if (c === 'shortcuts') {
    const p = Shortcuts.shortcutProgress();
    return `Mac shortcuts — ${p.known}/${p.total} known`;
  }
  if (c === 'adaptive') {
    const f = adaptiveFocus().focus;
    return f.length ? `Adaptive — focus: ${f.join(' ')}` : 'Adaptive — building your profile';
  }
  if (RAMP_LEVELS[c]) {   // Numbers / Symbols / Special-keys round
    const r = acquisitionRamp();
    if (r) return `${RAMP_LEVELS[c].label} — working on ${r.active.join(' ')}`;
  }
  if (c === 'words') return 'Words (fluency)';
  if (c === 'sentences') return 'Sentences (fluency)';
  if (c === 'all') return 'All keys';
  if (c === 'auto') {
    if (targetKey() === null && materialLevel() !== 'clusters') return `Fluency — ${materialLevel()} (auto)`;
    return `${STAGES[Stats.getSettings().stage]?.label ?? 'Practice'} (auto)`;
  }
  return STAGES[parseInt(c, 10)]?.label ?? 'Practice';
}
