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

// --- one-key-at-a-time introduction constants --------------------------------
// (Mastery-gate thresholds — RECENT_WINDOW, TARGET_MS, MASTERY_* — live in
// stats.js and are read via the Stats namespace, so there's one source of truth.)
const TARGET_PICK_P = 0.5;        // target key ≈ 1/3 of picks (w/ no-immediate-repeat)
const MIN_DRILL = 6;              // cold-start: keep at least this many keys in rotation
const MIN_TARGET_CAT_SLOTS = 3;   // slot floor when the target is a digit/symbol/special

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

// --- per-key mastery ----------------------------------------------------------

function isSpecialKey(keyId) {
  return SPECIAL_KEYS.some((s) => s.id === keyId);
}

// A key is mastered when, over its recent window, it clears BOTH a speed and an
// accuracy bar (keybr's ~35 WPM / 95%). Sticky once achieved. Speed is waived
// for special keys, which emit no latency.
export function isMastered(keyId) {
  if (Stats.isMasteredFlag(keyId)) return true;
  const r = Stats.recentStats(keyId);
  const speedOk = isSpecialKey(keyId)
    || (r.latSamples >= Stats.MASTERY_MIN_LAT_SAMPLES && r.avgLat <= Stats.TARGET_MS);
  return r.attempts >= Stats.MASTERY_MIN_ATTEMPTS && r.errRate <= Stats.MASTERY_MAX_ERR && speedOk;
}

// Continuous [0,1] mastery for the keyboard fill. Equals 1 exactly when the gate
// in isMastered() passes (all component scores clamp at 1 on their thresholds).
export function confidence(keyId) {
  if (Stats.isMasteredFlag(keyId)) return 1;
  const r = Stats.recentStats(keyId);
  const evidence = Math.min(1, r.attempts / Stats.MASTERY_MIN_ATTEMPTS);
  const speedScore = isSpecialKey(keyId) ? 1
    : (r.latSamples >= 3 ? clamp01((700 - r.avgLat) / (700 - Stats.TARGET_MS)) : 0);
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
  if (c === 'all') {
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
  if (Stats.getSettings().levelChoice === 'all') return null;
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

// Build one practice line (~12 slots) from the active pool.
export function generateLine() {
  const target = targetKey();
  const pool = (Stats.getSettings().levelChoice !== 'all' && target !== null)
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

// Reset per-target tracking at session start (and whenever the target changes).
export function startTracking() {
  lastAnnouncedTarget = null;
  paceSnapshots = [];
  etaSmoothed = null;
}

function resetPace() {
  paceSnapshots = [];
  etaSmoothed = null;
}

// Detect graduations / level-ups / new targets since the last call. Returns an
// event list the UI turns into notifications: {type:'mastered'|'levelUp'|'newTarget', ...}.
export function checkProgress() {
  const events = [];
  const st = Stats.getSettings();
  if (st.levelChoice === 'all') return events;
  // Any key whose gate now passes but isn't yet flagged has just graduated.
  for (const k of introductionOrder()) {
    if (!Stats.isMasteredFlag(k) && isMastered(k)) {
      Stats.markMastered(k);
      events.push({ type: 'mastered', keyId: k });
    }
  }
  if (st.levelChoice === 'auto') {
    const label = maybeAdvanceStage();
    if (label) events.push({ type: 'levelUp', label, nextLabel: STAGES[Stats.getSettings().stage]?.label });
  }
  const target = targetKey();
  if (target && target !== lastAnnouncedTarget) {
    events.push({ type: 'newTarget', keyId: target });
    lastAnnouncedTarget = target;
    resetPace();
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

export function stageLabel() {
  const c = Stats.getSettings().levelChoice;
  if (c === 'all') return 'All keys';
  if (c === 'auto') return `${STAGES[Stats.getSettings().stage]?.label ?? 'Practice'} (auto)`;
  return STAGES[parseInt(c, 10)]?.label ?? 'Practice';
}
