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

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

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

export function activePool() {
  const st = Stats.getSettings();
  const c = st.levelChoice;
  if (c === 'all') return poolFor(0, true);
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
  if (c === 'auto' || c === 'all') return null;
  return new Set(stageKeys(parseInt(c, 10)));
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

// Weakest keys within the active pool, for summaries / stats views.
export function weakest(n = 8) {
  const pool = activePool();
  const ids = [...pool.letters, ...pool.digits, ...pool.symbols, ...pool.specials];
  return ids
    .filter((id) => Stats.keyStat(id).attempts > 0)
    .map((id) => ({ keyId: id, weakness: weakness(id),
      errorRate: Stats.errorRate(id), avgLatency: Stats.avgLatency(id) }))
    .sort((a, b) => b.weakness - a.weakness)
    .slice(0, n);
}

// --- breadth-aware weighted sampling ------------------------------------------

// Picks keys by weakness while actively spreading coverage: a decaying "recently
// used" penalty plus a hard no-immediate-repeat rule.
function makeSampler(keys, focus = null) {
  const recent = new Map();
  let last = null;
  return {
    pick(prefer) {
      let candidates = keys;
      if (candidates.length > 1 && last !== null) {
        candidates = candidates.filter((k) => k !== last);
      }
      const weights = candidates.map((k) => {
        let w = weakness(k, focus);
        if (prefer && prefer(k)) w *= 1.8;          // e.g. bias toward vowels/consonants
        const r = recent.get(k) || 0;
        return w / (1 + 1.8 * r);                    // breadth: suppress just-used keys
      });
      const chosen = weightedIndex(candidates, weights);
      // decay everyone, bump the chosen — spreads subsequent picks around
      for (const [k, v] of recent) recent.set(k, v * 0.55);
      recent.set(chosen, (recent.get(chosen) || 0) + 1);
      last = chosen;
      return chosen;
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

// Build one practice line (~12 slots) from the active pool.
export function generateLine() {
  const pool = activePool();
  const focus = focusSet();
  const letterSampler = pool.letters.length ? makeSampler(pool.letters, focus) : null;
  const digitSampler = pool.digits.length ? makeSampler(pool.digits, focus) : null;
  const symbolSampler = pool.symbols.length ? makeSampler(pool.symbols, focus) : null;
  const specialSampler = pool.specials.filter((s) => s !== 'Shift');
  const specialRot = specialSampler.length ? makeSampler(specialSampler, focus) : null;

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

  const order = interleaveSlots(counts);
  const tokens = [];
  for (const cat of order) {
    if (cat === 'letters') tokens.push(...letterCluster(letterSampler, pool.letters, pool.caps));
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

// Ready to advance when the current stage's own keys are each practiced enough
// and accurate enough. Returns true/false.
export function canAdvanceStage() {
  const st = Stats.getSettings();
  if (st.stage >= STAGES.length - 1) return false;
  const keys = stageKeys(st.stage);
  if (!keys.length) return true; // e.g. a caps-only stage
  return keys.every((k) => {
    const s = Stats.keyStat(k);
    return s.attempts >= 12 && Stats.errorRate(k) <= 0.08;
  });
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

export function stageLabel() {
  const c = Stats.getSettings().levelChoice;
  if (c === 'all') return 'All keys';
  if (c === 'auto') return `${STAGES[Stats.getSettings().stage]?.label ?? 'Practice'} (auto)`;
  return STAGES[parseInt(c, 10)]?.label ?? 'Practice';
}
