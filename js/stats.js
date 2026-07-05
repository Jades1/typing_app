// stats.js — persistent per-key stats, session history, streaks.
//
// One JSON blob in localStorage. All timing is real wall-clock (browser Date),
// which is fine at app runtime.

import { SPECIAL_KEYS } from './fingers.js';

const STORAGE_KEY = 'typing_app_v1';

// --- mastery-gate constants ---------------------------------------------------
// These live here (the lowest layer) because both the storage/migration code
// below and engine.js need them; engine imports them via the Stats namespace so
// there is a single source of truth and no circular import.
export const RECENT_WINDOW = 30;           // per-key ring buffer size
export const TARGET_MS = 343;              // 35 WPM ≈ 175 cpm ≈ 343 ms/keystroke
export const MASTERY_MIN_ATTEMPTS = 20;    // recent attempts required to master
export const MASTERY_MIN_LAT_SAMPLES = 10; // recent correct-latency samples required
export const MASTERY_MAX_ERR = 0.05;       // recent error-rate ceiling

const SPECIAL_IDS = new Set(SPECIAL_KEYS.map((s) => s.id));

const DEFAULT_STATE = () => ({
  version: 2,
  seenCounter: 0,           // monotonic keystroke counter, drives recency
  keys: {},                 // keyId -> { attempts, errors, sumLatencyMs, samples, lastSeen, recent, mastered, masteredAt }
  sessions: [],             // { date:'YYYY-MM-DD', ts, durationMs, chars, correct, wpm, accuracy }
  settings: {
    sessionMinutes: 5,
    stage: 0,               // curriculum stage reached in auto mode (see engine STAGES)
    levelChoice: 'auto',    // 'auto' | '<stageIndex>' | 'all' — what to practice
    strictMode: true,       // must fix errors before advancing
    theme: 'auto',
    dailyGoalMinutes: 5,
    showFingers: true,      // finger-guidance scaffolding (hint text); toggled on the home screen
  },
});

let state = DEFAULT_STATE();

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...DEFAULT_STATE(), ...parsed,
        settings: { ...DEFAULT_STATE().settings, ...(parsed.settings || {}) } };
      migrate();
    }
  } catch (e) {
    console.warn('Could not load saved stats, starting fresh:', e);
    state = DEFAULT_STATE();
  }
  return state;
}

// Bring older saved blobs up to the current schema. v1 had no recent-window ring
// buffer or mastery flags; seed mastery from lifetime stats so returning users
// aren't dumped back to drilling 'a'. Seeding is deliberately lenient — it uses
// lifetime averages, which is fine as a one-time grandfather.
function migrate() {
  if (state.version === 2 && Object.values(state.keys).every((k) => Array.isArray(k.recent))) return;
  for (const id of Object.keys(state.keys)) {
    const k = state.keys[id];
    if (!Array.isArray(k.recent)) k.recent = [];
    if (typeof k.mastered !== 'boolean') {
      const err = k.attempts ? k.errors / k.attempts : 1;
      const avgLat = k.samples ? k.sumLatencyMs / k.samples : Infinity;
      const speedOk = SPECIAL_IDS.has(id) || avgLat <= TARGET_MS;
      k.mastered = k.attempts >= MASTERY_MIN_ATTEMPTS && err <= MASTERY_MAX_ERR && speedOk;
      k.masteredAt = k.mastered ? state.seenCounter : 0;
    }
  }
  state.version = 2;
  save();
}

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save stats:', e);
  }
}

export function getState() { return state; }
export function getSettings() { return state.settings; }
export function setSetting(key, value) { state.settings[key] = value; save(); }

// --- per-key stats ------------------------------------------------------------

function ensureKey(keyId) {
  if (!state.keys[keyId]) {
    state.keys[keyId] = { attempts: 0, errors: 0, sumLatencyMs: 0, samples: 0, lastSeen: 0, recent: [], mastered: false, masteredAt: 0 };
  }
  return state.keys[keyId];
}

export function keyStat(keyId) {
  return state.keys[keyId] || { attempts: 0, errors: 0, sumLatencyMs: 0, samples: 0, lastSeen: 0, recent: [], mastered: false, masteredAt: 0 };
}

// Record one attempt at a key. `latencyMs` is optional (specials may omit it).
export function recordKey(keyId, correct, latencyMs) {
  const k = ensureKey(keyId);
  state.seenCounter += 1;
  k.attempts += 1;
  if (!correct) k.errors += 1;
  k.lastSeen = state.seenCounter;
  // Only fold latency from correct keystrokes into the speed signal, so error
  // spikes don't double-count.
  const validLat = correct && typeof latencyMs === 'number' && latencyMs > 0 && latencyMs < 5000;
  if (validLat) {
    k.sumLatencyMs += latencyMs;
    k.samples += 1;
  }
  // Recent-window ring buffer — drives the mastery gate (recent, not lifetime).
  //   >0  correct keystroke, value = latency ms
  //    0  correct keystroke without a usable latency (e.g. special keys)
  //   -1  error
  k.recent.push(!correct ? -1 : (validLat ? latencyMs : 0));
  if (k.recent.length > RECENT_WINDOW) k.recent.shift();
}

// Recent-window view of a key (last RECENT_WINDOW attempts), for the mastery gate.
export function recentStats(keyId) {
  const rec = keyStat(keyId).recent || [];
  let errors = 0;
  const lats = [];
  for (const e of rec) {
    if (e === -1) errors += 1;
    else if (e > 0) lats.push(e);
  }
  const attempts = rec.length;
  const latSamples = lats.length;
  const avgLat = latSamples ? lats.reduce((a, b) => a + b, 0) / latSamples : 0;
  return { attempts, errors, errRate: attempts ? errors / attempts : 0, lats, latSamples, avgLat };
}

export function isMasteredFlag(keyId) {
  return !!keyStat(keyId).mastered;
}

// Sticky: once a key graduates it stays graduated (a later slip is handled by
// weakness-based re-emphasis in the normal rotation, not by de-mastering).
export function markMastered(keyId) {
  const k = ensureKey(keyId);
  if (!k.mastered) {
    k.mastered = true;
    k.masteredAt = state.seenCounter;
    save();
  }
}

export function errorRate(keyId) {
  const k = keyStat(keyId);
  return k.attempts ? k.errors / k.attempts : 0;
}

export function avgLatency(keyId) {
  const k = keyStat(keyId);
  return k.samples ? k.sumLatencyMs / k.samples : 0;
}

export function timesSinceSeen(keyId) {
  return state.seenCounter - keyStat(keyId).lastSeen;
}

export function seenCounter() { return state.seenCounter; }

// Median latency across all keys with samples — the baseline for normalization.
export function baselineLatency() {
  const lats = Object.keys(state.keys)
    .map(avgLatency)
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  if (!lats.length) return 400; // sensible default (ms) before we have data
  return lats[Math.floor(lats.length / 2)];
}

// --- sessions & streak --------------------------------------------------------

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function recordSession(summary) {
  state.sessions.push({ date: localDateStr(), ts: Date.now(), ...summary });
  save();
}

// Consecutive days up to and including today (or yesterday) with a session.
export function currentStreak() {
  const days = new Set(state.sessions.map((s) => s.date));
  if (!days.size) return 0;
  let streak = 0;
  const cur = new Date();
  // Allow the streak to still count if they haven't practiced yet *today*.
  if (!days.has(localDateStr(cur))) cur.setDate(cur.getDate() - 1);
  while (days.has(localDateStr(cur))) {
    streak += 1;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

export function practicedToday() {
  return state.sessions.some((s) => s.date === localDateStr());
}

export function minutesToday() {
  const today = localDateStr();
  const ms = state.sessions
    .filter((s) => s.date === today)
    .reduce((sum, s) => sum + (s.durationMs || 0), 0);
  return ms / 60000;
}

export function recentSessions(n = 20) {
  return state.sessions.slice(-n);
}

// --- metrics helpers ----------------------------------------------------------

// Standard WPM: (chars / 5) per minute.
export function computeWpm(chars, ms) {
  const minutes = ms / 60000;
  return minutes > 0 ? (chars / 5) / minutes : 0;
}

export function resetAll() {
  state = DEFAULT_STATE();
  save();
}
