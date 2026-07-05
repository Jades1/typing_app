// app.js — wires the modules together: input handling, the practice loop, the
// timed session, settings, and the stats panel.

import * as Stats from './stats.js';
import * as Engine from './engine.js';
import * as Keyboard from './keyboard.js';
import { createSession } from './session.js';
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
  els.start = $('#start-btn');
  els.minutes = $('#minutes-select');
  els.level = $('#level-select');
  els.strict = $('#strict-toggle');
  els.theme = $('#theme-select');
  els.reset = $('#reset-btn');
  els.streak = $('#streak-val');
  els.goal = $('#goal-val');
  els.weakList = $('#weak-list');
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
  tokens = Engine.generateLine();
  renderLine();
  Stats.save();
}

function judge(tok, correct, isChar) {
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
    if (!Stats.getSettings().strictMode) {
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
  // Let real browser shortcuts (Cmd/Ctrl combos) through instead of trapping them.
  if (e.metaKey || e.ctrlKey) return;

  e.preventDefault();                            // stop space/’/etc. from scrolling
  judge(tok, e.key === tok.expected, true);
}

// --- session control ----------------------------------------------------------
function startSession() {
  if (session && session.isRunning()) return;
  const minutes = parseFloat(els.minutes.value);
  Stats.setSetting('sessionMinutes', minutes);
  lastResolveTs = 0;
  nextLine();
  session = createSession({
    minutes,
    onTick: updateHud,
    onEnd: showSummary,
  });
  session.start();
  els.start.textContent = 'Stop';
  els.start.classList.add('running');
  document.body.classList.add('in-session');
}

function stopSession() {
  if (session && session.isRunning()) session.stop();  // triggers onEnd
}

function endUiReset() {
  els.start.textContent = 'Start session';
  els.start.classList.remove('running');
  document.body.classList.remove('in-session');
  Keyboard.clearHighlight();
  refreshStatsPanel();
}

function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function updateHud(live) {
  els.time.textContent = fmtTime(live.remainingMs);
  els.wpm.textContent = Math.round(live.wpm);
  els.acc.textContent = `${Math.round(live.accuracy * 100)}%`;
}

function showSummary(res) {
  endUiReset();
  const weak = res.weakest.length
    ? res.weakest.map((w) => `<span class="chip">${escapeHtml(labelForKey(w.keyId))}</span>`).join(' ')
    : '<em>none yet — nice and even</em>';
  els.summaryBody.innerHTML = `
    <div class="summary-grid">
      <div><span class="big">${Math.round(res.wpm)}</span><label>WPM</label></div>
      <div><span class="big">${Math.round(res.accuracy * 100)}%</span><label>accuracy</label></div>
      <div><span class="big">${res.chars}</span><label>characters</label></div>
      <div><span class="big">${res.streak}🔥</span><label>day streak</label></div>
    </div>
    ${res.advancedTo ? `<p class="advanced">✅ You passed <strong>${escapeHtml(res.advancedTo)}</strong> — new keys unlocked!</p>` : ''}
    <p class="weak-line"><strong>Focus next:</strong> ${weak}</p>`;
  els.summary.classList.add('open');
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

  els.minutes.value = String(st.sessionMinutes);
  els.level.value = st.levelChoice;
  els.strict.checked = st.strictMode;
  els.theme.value = st.theme;
  applyTheme(st.theme);

  // Seed a preview line so the keyboard/highlight isn't empty before starting.
  tokens = Engine.generateLine();
  renderLine();
  Keyboard.clearHighlight();
  refreshStatsPanel();

  els.start.addEventListener('click', () => {
    if (session && session.isRunning()) stopSession(); else startSession();
  });
  els.minutes.addEventListener('change', () => Stats.setSetting('sessionMinutes', parseFloat(els.minutes.value)));
  els.level.addEventListener('change', () => { Stats.setSetting('levelChoice', els.level.value); refreshStatsPanel(); if (!session || !session.isRunning()) { tokens = Engine.generateLine(); renderLine(); Keyboard.clearHighlight(); } });
  els.strict.addEventListener('change', () => Stats.setSetting('strictMode', els.strict.checked));
  els.theme.addEventListener('change', () => { Stats.setSetting('theme', els.theme.value); applyTheme(els.theme.value); });
  els.reset.addEventListener('click', () => {
    if (confirm('Reset all progress and stats? This cannot be undone.')) {
      Stats.resetAll();
      Stats.load();
      els.level.value = 'auto'; els.strict.checked = true;
      tokens = Engine.generateLine(); renderLine(); Keyboard.clearHighlight();
      refreshStatsPanel();
    }
  });
  els.summaryClose.addEventListener('click', () => els.summary.classList.remove('open'));

  document.addEventListener('keydown', onKeydown, { capture: true });
}

document.addEventListener('DOMContentLoaded', init);
