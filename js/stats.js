// stats.js — persistent per-key stats, session history, streaks.
//
// One JSON blob in localStorage. All timing is real wall-clock (browser Date),
// which is fine at app runtime.

const STORAGE_KEY = 'typing_app_v1';

const DEFAULT_STATE = () => ({
  version: 1,
  seenCounter: 0,           // monotonic keystroke counter, drives recency
  keys: {},                 // keyId -> { attempts, errors, sumLatencyMs, samples, lastSeen }
  sessions: [],             // { date:'YYYY-MM-DD', ts, durationMs, chars, correct, wpm, accuracy }
  settings: {
    sessionMinutes: 5,
    stage: 0,               // curriculum stage reached in auto mode (see engine STAGES)
    levelChoice: 'auto',    // 'auto' | '<stageIndex>' | 'all' — what to practice
    strictMode: true,       // must fix errors before advancing
    theme: 'auto',
    dailyGoalMinutes: 5,
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
    }
  } catch (e) {
    console.warn('Could not load saved stats, starting fresh:', e);
    state = DEFAULT_STATE();
  }
  return state;
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
    state.keys[keyId] = { attempts: 0, errors: 0, sumLatencyMs: 0, samples: 0, lastSeen: 0 };
  }
  return state.keys[keyId];
}

export function keyStat(keyId) {
  return state.keys[keyId] || { attempts: 0, errors: 0, sumLatencyMs: 0, samples: 0, lastSeen: 0 };
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
  if (correct && typeof latencyMs === 'number' && latencyMs > 0 && latencyMs < 5000) {
    k.sumLatencyMs += latencyMs;
    k.samples += 1;
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
