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
export const RECENT_WINDOW = 30;           // mastery-gate read span (last N attempts)
export const RECENT_MAX = 200;             // per-key ring buffer cap (widest read anyone needs)
export const TARGET_MS = 343;              // 35 WPM ≈ 175 cpm ≈ 343 ms/keystroke
export const MASTERY_MIN_ATTEMPTS = 20;    // recent attempts required to master
export const MASTERY_MIN_LAT_SAMPLES = 10; // recent correct-latency samples required
export const MASTERY_MAX_ERR = 0.05;       // recent error-rate ceiling

const SPECIAL_IDS = new Set(SPECIAL_KEYS.map((s) => s.id));

const DEFAULT_STATE = () => ({
  version: 4,
  seenCounter: 0,           // monotonic keystroke counter, drives recency
  keys: {},                 // keyId -> { attempts, errors, sumLatencyMs, samples, lastSeen, recent, mastered, masteredAt, episodes }
  // Open focus episodes: keyId -> { in, errIn, attemptsIn }. Closed ones move to
  // keys[id].episodes. This is the app's ONLY outcome metric — it answers "did
  // being focused actually help?" and "is this key repeatedly relapsing?".
  focusOpen: {},
  sessions: [],             // { date:'YYYY-MM-DD', ts, durationMs, chars, correct, wpm, accuracy }
  settings: {
    sessionMinutes: 5,
    stage: 0,               // curriculum stage reached in auto/Beginner mode (see engine STAGES)
    levelChoice: 'adaptive', // 'adaptive' (default) | 'auto' (Beginner course) | '<stageIndex>' | 'words' | 'sentences' | 'all'
    strictMode: true,       // must fix errors before advancing
    theme: 'auto',
    dailyGoalMinutes: 5,
    showFingers: true,      // finger-guidance scaffolding (hint text); toggled on the home screen
    adaptiveNoticeShown: false, // one-time "Adaptive mode is new" notice for grandfathered users
    pushMode: false,        // pacer: chase a target ~15% above your recent average (research/04)
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
  // v1 → v2: add recent-window ring buffers + seed mastery from lifetime stats so
  // returning users aren't dumped back to drilling 'a' (lenient one-time grandfather).
  if (state.version < 2 || Object.values(state.keys).some((k) => !Array.isArray(k.recent))) {
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
    if (state.version < 2) state.version = 2;
  }
  // v2 → v3: content-first adaptive becomes the default. Only flip barely-started
  // users still on the old 'auto' default; everyone else keeps their mode (and gets
  // a one-time discovery notice, shown by app.js).
  if (state.version < 3) {
    if (state.settings.levelChoice === 'auto' && state.seenCounter < 200) {
      state.settings.levelChoice = 'adaptive';
    }
    if (state.settings.adaptiveNoticeShown === undefined) state.settings.adaptiveNoticeShown = false;
    state.version = 3;
  }
  // v3 → v4: focus-episode instrumentation (research/13). Purely additive — existing
  // users start with an empty history and accumulate from their next session. There is
  // deliberately NO back-fill: we never observed past focus episodes, and inventing
  // them would poison the only outcome metric the app has.
  if (state.version < 4) {
    if (!state.focusOpen || typeof state.focusOpen !== 'object') state.focusOpen = {};
    for (const id of Object.keys(state.keys)) {
      if (!Array.isArray(state.keys[id].episodes)) state.keys[id].episodes = [];
    }
    state.version = 4;
  }
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
    state.keys[keyId] = { attempts: 0, errors: 0, sumLatencyMs: 0, samples: 0, lastSeen: 0, recent: [], mastered: false, masteredAt: 0, episodes: [] };
  }
  if (!Array.isArray(state.keys[keyId].episodes)) state.keys[keyId].episodes = [];
  return state.keys[keyId];
}

export function keyStat(keyId) {
  return state.keys[keyId] || { attempts: 0, errors: 0, sumLatencyMs: 0, samples: 0, lastSeen: 0, recent: [], mastered: false, masteredAt: 0, episodes: [] };
}

// --- focus episodes (the outcome metric) --------------------------------------
// An episode spans one continuous stretch of a key being a focus key. We record the
// error rate and attempt count at entry and at exit, so we can answer:
//   did it improve?      errIn - errOut
//   was the dose real?   reps (attempts delivered during the episode)
//   is it relapsing?     how many episodes this key has accumulated
export const EPISODES_MAX = 10;       // per key, ring-buffered

export function openEpisode(keyId, errRate) {
  if (state.focusOpen[keyId]) return;
  state.focusOpen[keyId] = { in: state.seenCounter, errIn: errRate, attemptsIn: keyStat(keyId).attempts };
}

export function closeEpisode(keyId, errRate) {
  const open = state.focusOpen[keyId];
  if (!open) return;
  delete state.focusOpen[keyId];
  const k = ensureKey(keyId);
  k.episodes.push({
    in: open.in, errIn: open.errIn, attemptsIn: open.attemptsIn,
    out: state.seenCounter, errOut: errRate, reps: k.attempts - open.attemptsIn,
  });
  // episodes[] is ring-buffered for storage, but RELAPSE COUNT must not saturate —
  // "how many times has this key come back" is the whole point of the metric, and a
  // heavy relapser hits EPISODES_MAX quickly (z reached 10 in one simulated run).
  k.focusCount = (k.focusCount || 0) + 1;
  if (k.episodes.length > EPISODES_MAX) k.episodes.shift();
}

export function openFocusKeys() { return Object.keys(state.focusOpen); }
export function episodes(keyId) { return keyStat(keyId).episodes || []; }

// Keystrokes since this key last LEFT focus (Infinity if it never has). Drives the
// fade-out: support is withdrawn gradually rather than at a cliff.
export function sinceFocusEnded(keyId) {
  const eps = episodes(keyId);
  if (!eps.length) return Infinity;
  return state.seenCounter - eps[eps.length - 1].out;
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
  if (k.recent.length > RECENT_MAX) k.recent.shift();
}

// Windowed view of a key's recent attempts. The buffer holds up to RECENT_MAX, but
// each consumer reads back only the span it wants:
//   - mastery gate / ETA / ramp / session deltas -> the default RECENT_WINDOW (30),
//     which is what those thresholds are calibrated against. Do NOT widen them.
//   - adaptive focus selection -> a frequency-normalized span (engine.focusWindow),
//     so a common key like 'e' is judged on ~5 sessions of evidence, not ~80 seconds.
export function recentStats(keyId, n = RECENT_WINDOW) {
  const all = keyStat(keyId).recent || [];
  const rec = all.length > n ? all.slice(-n) : all;
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

// Push-mode pace target: `mult`× the mean WPM of the last few sessions, floored so
// beginners aren't chasing an impossible number and capped for sanity. (research/04)
export function targetWpm(mult = 1.15, floor = 20, cap = 120, window = 5) {
  const s = recentSessions(window).filter((x) => (x.wpm || 0) > 0);
  if (!s.length) return floor + 5;   // no history → a gentle default
  const avg = s.reduce((a, x) => a + x.wpm, 0) / s.length;
  return Math.round(Math.min(cap, Math.max(floor, avg * mult)));
}

// Compare the most-recent (just-recorded) session against the mean of the prior
// few, for the end-of-session "am I improving?" readout. `recordSession` runs
// before the summary is shown, so the current session is the last element.
export function sessionComparison(window = 5) {
  const s = state.sessions;
  if (s.length < 2) return { hasHistory: false };
  const cur = s[s.length - 1];
  const prior = s.slice(-(window + 1), -1);   // up to `window` sessions before the current
  const mean = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0) / arr.length;
  const avgWpm = mean(prior, (x) => x.wpm);
  const avgAcc = mean(prior, (x) => x.accuracy);
  const isBestWpm = cur.wpm >= Math.max(...s.map((x) => x.wpm || 0));
  return {
    hasHistory: true,
    curWpm: cur.wpm, avgWpm,
    wpmDelta: cur.wpm - avgWpm,
    accDelta: cur.accuracy - avgAcc,
    isBestWpm,
  };
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
