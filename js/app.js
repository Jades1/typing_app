// app.js — wires the modules together: input handling, the practice loop, the
// timed session, settings, and the stats panel.

import * as Stats from './stats.js';
import * as Engine from './engine.js';
import * as Keyboard from './keyboard.js';
import { createSession } from './session.js';
import { notify, initNotify } from './notify.js';
import { FINGERS } from './fingers.js';

const $ = (sel) => document.querySelector(sel);

// --- element refs -------------------------------------------------------------
const els = {};
function cacheEls() {
  els.keyboard = $('#keyboard');
  els.legend = $('#legend');
  els.prompt = $('#prompt');
  els.fingerHint = $('#finger-hint');
  els.stageLabel = $('#stage-label');
  els.time = $('#hud-time');
  els.wpm = $('#hud-wpm');
  els.acc = $('#hud-acc');
  els.next = $('#hud-next');
  els.nextLabel = $('#hud-next-label');
  els.notice = $('#notice');
  els.fingers = $('#fingers-toggle');
  els.push = $('#push-toggle');
  els.pace = $('#hud-pace');
  els.paceWrap = $('#hud-pace-wrap');
  els.start = $('#start-btn');
  els.minutes = $('#minutes-select');
  els.level = $('#level-select');
  els.strict = $('#strict-toggle');
  els.theme = $('#theme-select');
  els.reset = $('#reset-btn');
  els.streak = $('#streak-val');
  els.goal = $('#goal-val');
  els.weakList = $('#weak-list');
  els.masteredList = $('#mastered-list');
  els.masteryCount = $('#mastery-count');
  els.history = $('#history-bars');
  els.summary = $('#summary');
  els.summaryBody = $('#summary-body');
  els.summaryClose = $('#summary-close');
}

// --- practice loop state ------------------------------------------------------
let tokens = [];
let tokenEls = [];
let pointer = 0;
let lastResolveTs = 0;
let session = null;

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

// Keys that would otherwise drive the browser/OS (Tab moves focus, space/arrows/
// Page keys scroll, Enter activates a focused button, Backspace navigates back).
// While a session is running these belong to the app, so we swallow them up front
// — even if the current token is momentarily unresolved — so nothing leaks to the
// computer. Cmd/Ctrl combos are exempted so real shortcuts (Cmd+R) still work.
const SWALLOW_KEYS = new Set([
  'Tab', ' ', 'Spacebar', 'Enter', 'Backspace',
  'PageUp', 'PageDown', 'Home', 'End',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

// --- push-mode pacer state ----------------------------------------------------
const PACER_HEAD_START_CHARS = 2;   // pacer spots you 2 tokens at each line start
const PACER_CATCH_SETBACK = 2;      // after a catch, pacer rebases this far behind you
const PACER_CATCH_COOLDOWN_MS = 1000;
const PACER_FLASH_MS = 450;
let pacer = null;   // { targetWpm, charMs, lineStartTs, lastPainted, raf, catches, linesTotal, linesAhead, lineCaught, cooldownUntil, active }

function renderLine() {
  els.prompt.innerHTML = '';
  tokenEls = tokens.map((tok) => {
    const span = document.createElement('span');
    span.className = 'tok tok-' + tok.type + ' tok-pending';
    if (tok.type === 'special') span.classList.add('tok-keycap');
    span.textContent = tok.display;
    els.prompt.appendChild(span);
    return span;
  });
  pointer = 0;
  refreshCursor();
  resetPacerForLine();
}

function refreshCursor() {
  tokenEls.forEach((el, i) => {
    el.classList.toggle('tok-current', i === pointer);
  });
  const tok = tokens[pointer];
  Keyboard.highlightToken(tok);
  els.fingerHint.textContent = tok ? Keyboard.fingerHint(tok) : '';
}

function nextLine() {
  if (session && session.isRunning()) {
    handleProgressEvents(Engine.checkProgress());
  }
  tokens = Engine.generateLine();
  renderLine();
  refreshKeyboardMastery();
  Stats.save();
}

function refreshKeyboardMastery() {
  const adaptive = Stats.getSettings().levelChoice === 'adaptive';
  Keyboard.updateMastery(Engine.confidenceMap(), adaptive ? Engine.adaptiveFocus().focus : Engine.targetKey());
}

// Turn engine progression events into on-screen notifications. A "mastered" event
// is folded into the following "newTarget" message when they fire together.
function handleProgressEvents(events) {
  let mastered = null;
  for (const ev of events) {
    if (ev.type === 'mastered') {
      mastered = ev.keyId;
    } else if (ev.type === 'levelUp') {
      els.stageLabel.textContent = Engine.stageLabel();
      notify(`Level complete: ${ev.label}${ev.nextLabel ? ` — next up: ${ev.nextLabel}` : ''}`, { duration: 6000 });
    } else if (ev.type === 'material') {
      els.stageLabel.textContent = Engine.stageLabel();
      notify(ev.level === 'sentences'
        ? 'Sentences unlocked — full fluency mode. 📝'
        : 'All letters mastered — real words unlocked! 📖', { duration: 6000 });
    } else if (ev.type === 'rampAdvance') {
      els.stageLabel.textContent = Engine.stageLabel();
      notify(`Now working on ${ev.active.map(labelForKey).join(' ')}`, { duration: 4500 });
    } else if (ev.type === 'newTarget') {
      const to = labelForKey(ev.keyId);
      notify(mastered
        ? `${labelForKey(mastered)} mastered! New key: ${to} — reach 35 WPM at 95% to unlock the next`
        : `New key: ${to} — reach 35 WPM at 95% to unlock the next`, { duration: 4500 });
      mastered = null;
    }
  }
  if (mastered) notify(`${labelForKey(mastered)} mastered! 🎉`, { duration: 4000 });
}

function judge(tok, correct, isChar) {
  // Pacer starts on the first keystroke of a line (reading time isn't penalized).
  if (pacer && pacer.active && !pacer.lineStartTs) pacer.lineStartTs = performance.now();
  const now = Date.now();
  const latency = lastResolveTs ? now - lastResolveTs : null;
  Stats.recordKey(tok.keyId, correct, isChar ? latency : undefined);
  if (session) session.recordResult(correct, isChar);

  const el = tokenEls[pointer];
  if (correct) {
    lastResolveTs = now;
    if (el) { el.classList.remove('tok-current', 'tok-error', 'tok-pending'); el.classList.add('tok-done'); }
    pointer += 1;
    if (pointer >= tokens.length) nextLine();
    else refreshCursor();
  } else {
    Keyboard.flashError(tok);
    if (el) { el.classList.add('tok-error'); }
    if (!effectiveStrict()) {
      lastResolveTs = now;
      if (el) el.classList.remove('tok-current');
      pointer += 1;
      if (pointer >= tokens.length) nextLine();
      else refreshCursor();
    }
    // strict mode: stay put; the user must press the right key.
  }
}

function onKeydown(e) {
  if (!session || !session.isRunning()) return;

  const shortcut = e.metaKey || e.ctrlKey;      // let real browser shortcuts through
  // Swallow app-owned keys BEFORE any early return, so Tab et al. never reach the
  // browser mid-session even if the current token isn't resolved yet.
  if (!shortcut && SWALLOW_KEYS.has(e.key)) e.preventDefault();

  const tok = tokens[pointer];
  if (!tok) return;

  if (tok.type === 'special') {
    e.preventDefault();               // esp. Tab, which would move focus
    // e.key for these is exactly 'Tab' | 'Shift' | 'Control' | 'Alt' | 'Meta'
    judge(tok, e.key === tok.expected, false);
    return;
  }

  // character / space token
  if (MODIFIER_KEYS.has(e.key)) return;         // wait for the actual character
  if (shortcut) return;

  e.preventDefault();                            // stop space/’/etc. from scrolling
  judge(tok, e.key === tok.expected, true);
}

// --- session control ----------------------------------------------------------
function startSession() {
  if (session && session.isRunning()) return;
  const minutes = parseFloat(els.minutes.value);
  Stats.setSetting('sessionMinutes', minutes);
  lastResolveTs = 0;
  Engine.startTracking();
  session = createSession({
    minutes,
    onTick: updateHud,
    onEnd: showSummary,
  });
  session.start();
  els.start.textContent = 'Stop';
  els.start.classList.add('running');
  document.body.classList.add('in-session');
  if (Stats.getSettings().pushMode) startPacer();
  nextLine();   // session is now running → announces the current target
}

function stopSession() {
  if (session && session.isRunning()) session.stop();  // triggers onEnd
}

function endUiReset() {
  els.start.textContent = 'Start session';
  els.start.classList.remove('running');
  document.body.classList.remove('in-session');
  Keyboard.clearHighlight();
  stopPacer();
  refreshStatsPanel();
}

// While push mode is on, don't force error correction — speed over perfection.
// The user's own strict setting is left untouched.
function effectiveStrict() {
  const st = Stats.getSettings();
  return st.strictMode && !st.pushMode;
}

// --- push-mode pacer ----------------------------------------------------------
// A marker races through the current line at a target pace (~15% above your recent
// average); stay ahead of it. Getting caught just flashes + rebases — no reset.
function startPacer() {
  const targetWpm = Stats.targetWpm();
  pacer = {
    targetWpm, charMs: 60000 / (targetWpm * 5), lineStartTs: 0, lastPainted: -1,
    raf: 0, catches: 0, linesTotal: 0, linesAhead: 0, lineCaught: false,
    cooldownUntil: 0, active: true,
  };
  updatePaceHud();
  pacer.raf = requestAnimationFrame(pacerLoop);
}

function resetPacerForLine() {
  if (!pacer) return;
  if (pacer.lineStartTs) {          // tally the line we just left
    pacer.linesTotal += 1;
    if (!pacer.lineCaught) pacer.linesAhead += 1;
  }
  pacer.lineStartTs = 0;            // pacer waits for the first keystroke of the new line
  pacer.lineCaught = false;
  paintPacer(-1);
}

function pacerIndexNow(now) {
  if (!pacer || !pacer.lineStartTs) return -1;
  return Math.floor((now - pacer.lineStartTs) / pacer.charMs) - PACER_HEAD_START_CHARS;
}

function pacerLoop() {
  if (!pacer || !pacer.active) return;
  const now = performance.now();
  const idx = pacerIndexNow(now);
  paintPacer(idx);
  if (idx >= pointer && pointer < tokens.length && now >= pacer.cooldownUntil) onPacerCaught(now);
  pacer.raf = requestAnimationFrame(pacerLoop);
}

function paintPacer(idx) {
  if (!pacer || idx === pacer.lastPainted) return;
  tokenEls[pacer.lastPainted]?.classList.remove('tok-pacer');
  if (idx >= 0 && idx < tokenEls.length) tokenEls[idx].classList.add('tok-pacer');
  pacer.lastPainted = idx;
}

function onPacerCaught(now) {
  pacer.catches += 1;
  pacer.lineCaught = true;
  pacer.cooldownUntil = now + PACER_CATCH_COOLDOWN_MS;
  // rebase just behind the cursor so pressure resumes immediately (no reset).
  pacer.lineStartTs = now - (pointer - PACER_CATCH_SETBACK + PACER_HEAD_START_CHARS) * pacer.charMs;
  els.prompt.classList.add('pacer-caught');
  setTimeout(() => els.prompt.classList.remove('pacer-caught'), PACER_FLASH_MS);
}

function stopPacer() {
  if (!pacer) return;
  cancelAnimationFrame(pacer.raf);
  paintPacer(-1);
  els.prompt.classList.remove('pacer-caught');
  pacer.active = false;   // keep the object so showSummary can read the tallies
  updatePaceHud();
}

function updatePaceHud() {
  const on = pacer && pacer.active;
  els.paceWrap.hidden = !on;
  if (on) els.pace.textContent = `${pacer.targetWpm}`;
}

function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function updateHud(live) {
  els.time.textContent = fmtTime(live.remainingMs);
  els.wpm.textContent = Math.round(live.wpm);
  els.acc.textContent = `${Math.round(live.accuracy * 100)}%`;
  // Adaptive has no "next key" — show the keys being learned / focused instead.
  if (Stats.getSettings().levelChoice === 'adaptive') {
    const r = Engine.acquisitionRamp();
    const f = Engine.adaptiveFocus(r).focus;
    const show = r ? [...r.active, ...f].slice(0, 3) : f;
    els.nextLabel.textContent = r ? 'Learning' : 'Focus';
    els.next.textContent = show.length ? show.map(labelForKey).join(' ') : '—';
  } else {
    els.nextLabel.textContent = 'Next key';
    els.next.textContent = formatEta(Engine.nextKeyEta());
  }
}

// Deliberately coarse — this is an order-of-magnitude estimate, not a countdown.
function formatEta(eta) {
  if (!eta || eta.keyId == null) return '—';
  if (eta.measuring || eta.minutes == null) return '…';
  const m = eta.minutes;
  if (m < 0.75) return '<1 min';
  if (m > 10) return '10+ min';
  return `~${Math.round(m)} min`;
}

// Signed delta with an arrow + colour class (▲ good / ▼ eased off / – flat).
function deltaChip(value, digits = 0, suffix = '') {
  const v = Number(value) || 0;
  const rounded = digits ? v.toFixed(digits) : Math.round(v);
  if (Math.abs(v) < (digits ? 0.5 / 10 ** digits : 0.5)) return `<span class="delta flat">–</span>`;
  const up = v > 0;
  const mag = digits ? Math.abs(v).toFixed(digits) : Math.abs(Math.round(v));
  return `<span class="delta ${up ? 'up' : 'down'}">${up ? '▲' : '▼'}${mag}${suffix}</span>`;
}

function showSummary(res) {
  endUiReset();
  const adaptive = Stats.getSettings().levelChoice === 'adaptive';
  const cmp = Stats.sessionComparison();
  const prog = Engine.masteryProgress();
  const mastered = Engine.keysMasteredThisSession();
  const target = Engine.targetKey();

  // 1. improvement trend vs. recent average (or a baseline note on the first run)
  let trend;
  if (!cmp.hasHistory) {
    trend = `<p class="trend baseline">Baseline set — finish another session to see your trend.</p>`;
  } else {
    const best = cmp.isBestWpm ? `<span class="pb">🎉 New best!</span>` : '';
    trend = `<p class="trend">vs. your recent average:
      WPM ${deltaChip(cmp.wpmDelta)} &nbsp; accuracy ${deltaChip(cmp.accDelta * 100, 0, '%')} ${best}</p>`;
  }

  // 2. progress this session. Adaptive reports keys that IMPROVED (no curriculum);
  // the curriculum modes report keys mastered / the next target.
  let progressLine; let progressCount = '';
  if (adaptive) {
    const deltas = Engine.sessionKeyDeltas();
    if (mastered.length) {
      const chips = mastered.map((k) => `<span class="chip good">${escapeHtml(labelForKey(k))}</span>`).join(' ');
      progressLine = `<p class="progress"><strong>Mastered this session:</strong> ${chips}</p>`;
    } else if (deltas.length) {
      const chips = deltas.map((d) => {
        const bits = [];
        if (d.latDelta > 15) bits.push(`▲${Math.round(d.latDelta)}ms`);
        if (d.errDelta > 0.02) bits.push(`▲${Math.round(d.errDelta * 100)}% acc`);
        return `<span class="chip good">${escapeHtml(labelForKey(d.keyId))} ${bits.join(' · ')}</span>`;
      }).join(' ');
      progressLine = `<p class="progress"><strong>Improved this session:</strong> ${chips}</p>`;
    } else {
      progressLine = `<p class="progress">Even performance — your focus keys will rotate as data comes in.</p>`;
    }
  } else {
    if (mastered.length) {
      const chips = mastered.map((k) => `<span class="chip good">${escapeHtml(labelForKey(k))}</span>`).join(' ');
      progressLine = `<p class="progress"><strong>Mastered this session:</strong> ${chips}</p>`;
    } else if (target) {
      progressLine = `<p class="progress">No new keys yet — keep drilling <strong>${escapeHtml(labelForKey(target))}</strong> to unlock the next.</p>`;
    } else {
      progressLine = `<p class="progress">Every key in this mode is mastered — nice work.</p>`;
    }
    progressCount = `<p class="progress-count">${prog.mastered} / ${prog.total} keys mastered</p>`;
  }

  // Beginner escape hatch: if adaptive is clearly too hard, point to the course.
  const beginnerHint = (adaptive && res.accuracy < 0.75 && res.wpm < 12)
    ? `<p class="progress-count">Finding this hard? The <strong>Beginner course</strong> (Level menu) teaches key locations one at a time.</p>`
    : '';

  // Push-mode pacer recap (pacer object survives stopPacer with its tallies).
  const paceLine = (pacer && pacer.linesTotal > 0)
    ? `<p class="progress">Push pacer (${pacer.targetWpm} WPM target): stayed ahead on <strong>${pacer.linesAhead} / ${pacer.linesTotal}</strong> lines · caught ${pacer.catches}×.</p>`
    : '';
  pacer = null;

  // 3. weak spots with concrete numbers
  const weak = res.weakest.length
    ? res.weakest.slice(0, 3).map((w) => {
        const err = Math.round(w.errorRate * 100);
        const ms = Math.round(w.avgLatency);
        const detail = err >= 8 ? `${err}% errors` : (ms ? `${ms} ms` : 'new');
        return `<span class="chip">${escapeHtml(labelForKey(w.keyId))} · ${detail}</span>`;
      }).join(' ')
    : '<em>none yet — nice and even</em>';

  els.summaryBody.innerHTML = `
    <div class="summary-grid">
      <div><span class="big">${Math.round(res.wpm)}</span><label>WPM</label></div>
      <div><span class="big">${Math.round(res.accuracy * 100)}%</span><label>accuracy</label></div>
      <div><span class="big">${res.chars}</span><label>characters</label></div>
      <div><span class="big">${res.streak}🔥</span><label>day streak</label></div>
    </div>
    ${trend}
    ${paceLine}
    ${res.advancedTo ? `<p class="advanced">✅ You passed <strong>${escapeHtml(res.advancedTo)}</strong> — new keys unlocked!</p>` : ''}
    ${progressLine}
    ${progressCount}
    <p class="weak-line"><strong>Work on:</strong> ${weak}</p>
    ${beginnerHint}
    <p class="encourage">${encouragement(cmp, mastered.length)}</p>`;
  els.summary.classList.add('open');
}

// One honest, kind line. A slower session isn't failure — WPM dips when a hard
// new key is introduced, which is expected.
function encouragement(cmp, masteredCount) {
  if (cmp.isBestWpm) return 'Personal best — you\'re on a roll. 🚀';
  if (masteredCount > 0) return `You locked in ${masteredCount} new key${masteredCount > 1 ? 's' : ''} — that\'s real progress.`;
  if (!cmp.hasHistory) return 'Great start. Consistency is what builds speed — see you tomorrow.';
  if (cmp.wpmDelta > 1) return 'Faster than your recent average — keep it up.';
  if (cmp.wpmDelta < -1) return 'A bit slower today — normal when you\'re drilling a tough new key. Stick with it.';
  return 'Steady and consistent — that\'s exactly how speed compounds.';
}

// --- settings & panel ---------------------------------------------------------
function labelForKey(keyId) {
  const map = { ' ': 'Space', Tab: 'Tab', Shift: 'Shift', Control: 'Control', Alt: 'Option', Meta: 'Command' };
  return map[keyId] || keyId;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function applyTheme(theme) {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

// Finger guidance is scaffolding — hide the hint text when off (key tints stay).
function applyFingers(on) {
  document.body.classList.toggle('no-fingers', !on);
}

function buildLegend() {
  const seen = new Set();
  els.legend.innerHTML = '';
  for (const [id, f] of Object.entries(FINGERS)) {
    if (seen.has(f.name)) continue;
    seen.add(f.name);
    const item = document.createElement('span');
    item.className = 'legend-item';
    item.innerHTML = `<span class="swatch" style="background:${f.color}"></span>${f.name}`;
    els.legend.appendChild(item);
  }
}

function refreshStatsPanel() {
  els.stageLabel.textContent = Engine.stageLabel();
  els.streak.textContent = `${Stats.currentStreak()}`;
  const goal = Stats.getSettings().dailyGoalMinutes;
  els.goal.textContent = `${Math.round(Stats.minutesToday())} / ${goal} min today`;

  const weak = Engine.weakest(8);
  els.weakList.innerHTML = weak.length
    ? weak.map((w) => `<span class="chip" title="${Math.round(w.errorRate * 100)}% errors, ${Math.round(w.avgLatency)}ms">${escapeHtml(labelForKey(w.keyId))}</span>`).join('')
    : '<em>Practice a bit and your weak keys will appear here.</em>';

  const mastered = Engine.masteredKeys();
  const prog = Engine.masteryProgress();
  els.masteryCount.textContent = prog.total ? `${prog.mastered} / ${prog.total}` : '';
  els.masteredList.innerHTML = mastered.length
    ? mastered.map((k) => `<span class="chip good">${escapeHtml(labelForKey(k))}</span>`).join('')
    : '<em>Master your first key to see it here.</em>';

  const sessions = Stats.recentSessions(20);
  const max = Math.max(40, ...sessions.map((s) => s.wpm || 0));
  els.history.innerHTML = sessions.length
    ? sessions.map((s) => `<span class="bar" style="height:${Math.max(4, (s.wpm / max) * 100)}%" title="${Math.round(s.wpm)} WPM · ${Math.round(s.accuracy * 100)}% · ${s.date}"></span>`).join('')
    : '<em>No sessions yet.</em>';
}

// --- init ---------------------------------------------------------------------
function init() {
  cacheEls();
  Stats.load();
  const st = Stats.getSettings();

  Keyboard.render(els.keyboard);
  buildLegend();
  initNotify(els.notice);

  els.minutes.value = String(st.sessionMinutes);
  els.level.value = st.levelChoice;
  els.strict.checked = st.strictMode;
  els.theme.value = st.theme;
  applyTheme(st.theme);
  els.fingers.checked = st.showFingers;
  applyFingers(st.showFingers);
  els.push.checked = st.pushMode;

  // Seed a preview line so the keyboard/highlight isn't empty before starting.
  tokens = Engine.generateLine();
  renderLine();
  Keyboard.clearHighlight();
  refreshKeyboardMastery();
  refreshStatsPanel();

  // One-time discovery notice for grandfathered users still on a curriculum mode.
  if (st.levelChoice !== 'adaptive' && !st.adaptiveNoticeShown) {
    notify('New: Adaptive mode — type real words while the app finds and drills your weak keys. Pick it from the Level menu.', { duration: 8000 });
    Stats.setSetting('adaptiveNoticeShown', true);
  }

  els.start.addEventListener('click', () => {
    if (session && session.isRunning()) stopSession(); else startSession();
  });
  els.minutes.addEventListener('change', () => Stats.setSetting('sessionMinutes', parseFloat(els.minutes.value)));
  els.level.addEventListener('change', () => { Stats.setSetting('levelChoice', els.level.value); refreshStatsPanel(); if (!session || !session.isRunning()) { tokens = Engine.generateLine(); renderLine(); Keyboard.clearHighlight(); refreshKeyboardMastery(); } });
  els.strict.addEventListener('change', () => Stats.setSetting('strictMode', els.strict.checked));
  els.fingers.addEventListener('change', () => { Stats.setSetting('showFingers', els.fingers.checked); applyFingers(els.fingers.checked); });
  els.push.addEventListener('change', () => {
    Stats.setSetting('pushMode', els.push.checked);
    if (session && session.isRunning()) { if (els.push.checked) startPacer(); else stopPacer(); }
  });
  els.theme.addEventListener('change', () => { Stats.setSetting('theme', els.theme.value); applyTheme(els.theme.value); });
  els.reset.addEventListener('click', () => {
    if (confirm('Reset all progress and stats? This cannot be undone.')) {
      Stats.resetAll();
      Stats.load();
      els.level.value = 'adaptive'; els.strict.checked = true;
      tokens = Engine.generateLine(); renderLine(); Keyboard.clearHighlight();
      refreshKeyboardMastery();
      refreshStatsPanel();
    }
  });
  els.summaryClose.addEventListener('click', () => els.summary.classList.remove('open'));

  document.addEventListener('keydown', onKeydown, { capture: true });
}

document.addEventListener('DOMContentLoaded', init);
