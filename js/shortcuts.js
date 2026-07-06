// shortcuts.js — Mac keyboard-shortcut practice mode.
//
// Two skills per shortcut, both accuracy-only, stored as synthetic keys in Stats:
//   sc:<id>   can you PRODUCE the combo (press it)   — catchable shortcuts only
//   scq:<id>  do you KNOW what it does (multiple choice) — every shortcut
// No schema change: these ride the existing per-key ring buffer.
//
// Detection matches KeyboardEvent.code (layout-physical, like keyboard.js) so it's
// immune to Shift case-flips and Option producing odd characters.

import * as Stats from './stats.js';

// keys: {meta,shift,alt,ctrl,code} for live detection; null = knowledge-only (never
// required by keypress — e.g. it would close the tab, or is OS-level).
export const SHORTCUTS = [
  // --- catchable (safe to press; we preventDefault them) ---
  { id: 'cut', action: 'Cut', keycaps: ['⌘', 'X'], keys: { meta: true, code: 'KeyX' }, catchable: true },
  { id: 'redo', action: 'Redo', keycaps: ['⇧', '⌘', 'Z'], keys: { meta: true, shift: true, code: 'KeyZ' }, catchable: true },
  { id: 'select-all', action: 'Select all', keycaps: ['⌘', 'A'], keys: { meta: true, code: 'KeyA' }, catchable: true },
  { id: 'open', action: 'Open a file', keycaps: ['⌘', 'O'], keys: { meta: true, code: 'KeyO' }, catchable: true },
  { id: 'bold', action: 'Bold text', keycaps: ['⌘', 'B'], keys: { meta: true, code: 'KeyB' }, catchable: true },
  { id: 'italic', action: 'Italicize text', keycaps: ['⌘', 'I'], keys: { meta: true, code: 'KeyI' }, catchable: true },
  { id: 'underline', action: 'Underline text', keycaps: ['⌘', 'U'], keys: { meta: true, code: 'KeyU' }, catchable: true },
  { id: 'paste-match', action: 'Paste and match style', keycaps: ['⌥', '⇧', '⌘', 'V'], keys: { meta: true, shift: true, alt: true, code: 'KeyV' }, catchable: true },
  { id: 'find-next', action: 'Find next match', keycaps: ['⌘', 'G'], keys: { meta: true, code: 'KeyG' }, catchable: true },
  { id: 'actual-size', action: 'Reset zoom to actual size', keycaps: ['⌘', '0'], keys: { meta: true, code: 'Digit0' }, catchable: true },
  { id: 'preferences', action: "Open the app's settings", keycaps: ['⌘', ','], keys: { meta: true, code: 'Comma' }, catchable: true },
  { id: 'line-start', action: 'Jump to start of the line', keycaps: ['⌘', '←'], keys: { meta: true, code: 'ArrowLeft' }, catchable: true },
  { id: 'line-end', action: 'Jump to end of the line', keycaps: ['⌘', '→'], keys: { meta: true, code: 'ArrowRight' }, catchable: true },

  // --- knowledge-only (destructive or OS-level; quiz-only, never pressed) ---
  { id: 'close', action: 'Close the window or tab', keycaps: ['⌘', 'W'], keys: null, catchable: false, note: "Quiz only — pressing it would close this tab!" },
  { id: 'new', action: 'New window or document', keycaps: ['⌘', 'N'], keys: null, catchable: false, note: 'Quiz only.' },
  { id: 'new-tab', action: 'Open a new tab', keycaps: ['⌘', 'T'], keys: null, catchable: false, note: 'Quiz only.' },
  { id: 'reopen-tab', action: 'Reopen the last closed tab', keycaps: ['⇧', '⌘', 'T'], keys: null, catchable: false, note: 'Quiz only.' },
  { id: 'new-private', action: 'New private / incognito window', keycaps: ['⇧', '⌘', 'N'], keys: null, catchable: false, note: 'Quiz only.' },
  { id: 'hide', action: 'Hide the front app', keycaps: ['⌘', 'H'], keys: null, catchable: false, note: 'Quiz only — OS shortcut.' },
  { id: 'minimize', action: 'Minimize the window', keycaps: ['⌘', 'M'], keys: null, catchable: false, note: 'Quiz only — OS shortcut.' },
  { id: 'cycle-windows', action: "Cycle the app's windows", keycaps: ['⌘', '`'], keys: null, catchable: false, note: 'Quiz only.' },
  { id: 'app-switch', action: 'Switch between open apps', keycaps: ['⌘', '⇥'], keys: null, catchable: false, note: 'Quiz only — OS shortcut.' },
  { id: 'spotlight', action: 'Open Spotlight search', keycaps: ['⌘', 'Space'], keys: null, catchable: false, note: 'Quiz only — OS shortcut.' },
  { id: 'screenshot', action: 'Screenshot a selected area', keycaps: ['⇧', '⌘', '4'], keys: null, catchable: false, note: 'Quiz only — OS shortcut.' },
  { id: 'force-quit', action: 'Force-quit an app', keycaps: ['⌥', '⌘', '⎋'], keys: null, catchable: false, note: 'Quiz only — OS shortcut.' },
];

export const CATCHABLE = SHORTCUTS.filter((s) => s.catchable);
const BY_ID = Object.fromEntries(SHORTCUTS.map((s) => [s.id, s]));
export function byId(id) { return BY_ID[id]; }
const comboStr = (s) => s.keycaps.join('');

// Exact-modifier match on a live keydown.
export function comboMatches(e, k) {
  return !!e.metaKey === !!k.meta && !!e.shiftKey === !!k.shift
    && !!e.altKey === !!k.alt && !!e.ctrlKey === !!k.ctrl
    && e.code === k.code;
}

// --- scheduling (session-local; weakest + least-recently-seen, no immediate repeat) ---
let recent = new Map();
let last = null;

export function startTracking() { recent = new Map(); last = null; }

function skill(s) {   // higher errRate on either skill → practice more; unseen → boost
  const q = Stats.recentStats('scq:' + s.id);
  const p = s.catchable ? Stats.recentStats('sc:' + s.id) : { attempts: 0, errRate: 0 };
  const seen = q.attempts + p.attempts;
  const err = Math.max(q.errRate, p.errRate);
  return { seen, err };
}

function pickShortcut() {
  let pool = SHORTCUTS;
  if (last && pool.length > 1) pool = pool.filter((s) => s.id !== last);
  const weights = pool.map((s) => {
    const { seen, err } = skill(s);
    const w = 1 + 3 * err + (seen === 0 ? 1.5 : 0);
    return w / (1 + 1.8 * (recent.get(s.id) || 0));
  });
  let r = pseudoRandom() * weights.reduce((a, b) => a + b, 0);
  let chosen = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { chosen = pool[i]; break; } }
  for (const [k, v] of recent) recent.set(k, v * 0.55);
  recent.set(chosen.id, (recent.get(chosen.id) || 0) + 1);
  last = chosen.id;
  return chosen;
}

function pseudoRandom() { return Math.random(); }

// Build 4 multiple-choice options: the correct one + 3 confusable distractors.
function options(correct, kind) {
  const label = (s) => (kind === 'recall-action' ? s.action : comboStr(s));
  const others = SHORTCUTS.filter((s) => s.id !== correct.id);
  const score = (s) => {
    let sc = pseudoRandom() * 0.5;
    if (s.keycaps[s.keycaps.length - 1] === correct.keycaps[correct.keycaps.length - 1]) sc += 2; // same base key
    if (s.keycaps.length === correct.keycaps.length) sc += 1;
    return sc;
  };
  const distractors = others.sort((a, b) => score(b) - score(a)).slice(0, 3);
  const opts = [correct, ...distractors].map((s) => ({ label: label(s), correct: s.id === correct.id }));
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(pseudoRandom() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return opts;
}

// One shortcut card per line.
export function shortcutLine() {
  const s = pickShortcut();
  const p = s.catchable ? Stats.recentStats('sc:' + s.id) : null;
  const firstSeen = (p ? p.attempts : Stats.recentStats('scq:' + s.id).attempts) === 0;
  let mode;
  if (s.catchable) {
    mode = (firstSeen || pseudoRandom() < 0.6) ? 'produce' : 'recall-action';
  } else {
    mode = firstSeen ? 'recall-action' : (pseudoRandom() < 0.5 ? 'recall-action' : 'recall-combo');
  }
  const token = {
    type: 'shortcut', mode, shortcut: s,
    keyId: mode === 'produce' ? 'sc:' + s.id : 'scq:' + s.id,
    options: mode === 'produce' ? null : options(s, mode),
    // hint keycaps while still learning to produce it
    hint: mode === 'produce' && (p.attempts < 4 || (p.recent.length && p.recent[p.recent.length - 1] === -1)),
  };
  return [token];
}

// --- progress ---
function known(s) { const r = Stats.recentStats('scq:' + s.id); return r.attempts >= 3 && r.errRate <= 0.25; }
function produced(s) { const r = Stats.recentStats('sc:' + s.id); return r.attempts >= 3 && r.errRate <= 0.25; }

export function shortcutProgress() {
  return {
    known: SHORTCUTS.filter(known).length, total: SHORTCUTS.length,
    produced: CATCHABLE.filter(produced).length, producedTotal: CATCHABLE.length,
  };
}

let lastKnown = new Set();
export function checkProgress() {
  const events = [];
  for (const s of SHORTCUTS) {
    if (known(s) && !lastKnown.has(s.id)) { events.push({ type: 'shortcutMastered', combo: comboStr(s), action: s.action }); lastKnown.add(s.id); }
    else if (!known(s)) lastKnown.delete(s.id);
  }
  return events;
}

export function weakestShortcuts(n = 3) {
  return SHORTCUTS
    .map((s) => ({ s, err: skill(s).err, seen: skill(s).seen }))
    .filter((x) => x.seen > 0)
    .sort((a, b) => b.err - a.err)
    .slice(0, n)
    .map((x) => ({ id: x.s.id, combo: comboStr(x.s), action: x.s.action }));
}
