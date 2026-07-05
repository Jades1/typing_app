// keyboard.js — renders an on-screen Mac QWERTY keyboard, colours every key by
// finger, and highlights the next key (+ the correct Shift) to press.

import { FINGERS, KEY_FINGER, SHIFT_MAP, fingerFor, fingerName } from './fingers.js';

// base key -> the symbol printed above it (for the little sub-labels)
const SHIFT_LABEL = {};
for (const [sym, base] of Object.entries(SHIFT_MAP)) SHIFT_LABEL[base] = sym;

// Physical layout. Each key: [id, label, widthUnits, opts].
// opts: { side:'Left'|'Right', sub:true (auto shifted label), special:true }
const LAYOUT = [
  [
    ['`', '`', 1], ['1', '1', 1], ['2', '2', 1], ['3', '3', 1], ['4', '4', 1],
    ['5', '5', 1], ['6', '6', 1], ['7', '7', 1], ['8', '8', 1], ['9', '9', 1],
    ['0', '0', 1], ['-', '-', 1], ['=', '=', 1], ['Backspace', 'delete', 1.6, { special: true }],
  ],
  [
    ['Tab', 'tab', 1.6, { special: true }],
    ['q', 'q', 1], ['w', 'w', 1], ['e', 'e', 1], ['r', 'r', 1], ['t', 't', 1],
    ['y', 'y', 1], ['u', 'u', 1], ['i', 'i', 1], ['o', 'o', 1], ['p', 'p', 1],
    ['[', '[', 1], [']', ']', 1], ['\\', '\\', 1],
  ],
  [
    ['CapsLock', 'caps', 1.8, { special: true }],
    ['a', 'a', 1], ['s', 's', 1], ['d', 'd', 1], ['f', 'f', 1], ['g', 'g', 1],
    ['h', 'h', 1], ['j', 'j', 1], ['k', 'k', 1], ['l', 'l', 1], [';', ';', 1], ["'", "'", 1],
    ['Enter', 'return', 1.8, { special: true }],
  ],
  [
    ['Shift', 'shift', 2.2, { special: true, side: 'Left' }],
    ['z', 'z', 1], ['x', 'x', 1], ['c', 'c', 1], ['v', 'v', 1], ['b', 'b', 1],
    ['n', 'n', 1], ['m', 'm', 1], [',', ',', 1], ['.', '.', 1], ['/', '/', 1],
    ['Shift', 'shift', 2.2, { special: true, side: 'Right' }],
  ],
  [
    ['Control', 'control', 1.4, { special: true, side: 'Left' }],
    ['Alt', 'option', 1.4, { special: true, side: 'Left' }],
    ['Meta', 'command', 1.6, { special: true, side: 'Left' }],
    [' ', '', 6, { special: true }],
    ['Meta', 'command', 1.6, { special: true, side: 'Right' }],
    ['Alt', 'option', 1.4, { special: true, side: 'Right' }],
    ['Control', 'control', 1.4, { special: true, side: 'Right' }],
  ],
];

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

let container = null;
const highlighted = [];

export function render(el) {
  container = el;
  container.innerHTML = '';
  container.classList.add('keyboard');
  for (const row of LAYOUT) {
    const rowEl = document.createElement('div');
    rowEl.className = 'kb-row';
    for (const [id, label, w, opts = {}] of row) {
      const key = document.createElement('div');
      key.className = 'kb-key' + (opts.special ? ' kb-special' : '');
      key.style.flexGrow = String(w);
      key.dataset.key = id;
      if (opts.side) key.dataset.side = opts.side;

      const finger = fingerFor(id);
      if (finger && FINGERS[finger]) {
        key.style.setProperty('--finger', FINGERS[finger].color);
        key.style.backgroundColor = hexToRgba(FINGERS[finger].color, 0.16);
        key.dataset.finger = finger;
      }

      if (SHIFT_LABEL[id]) {
        const sub = document.createElement('span');
        sub.className = 'kb-sub';
        sub.textContent = SHIFT_LABEL[id];
        key.appendChild(sub);
      }
      const main = document.createElement('span');
      main.className = 'kb-main';
      main.textContent = id === ' ' ? '' : label;
      key.appendChild(main);

      rowEl.appendChild(key);
    }
    container.appendChild(rowEl);
  }
  return container;
}

function keyEls(id, side) {
  const all = [...container.querySelectorAll(`.kb-key[data-key="${cssEscape(id)}"]`)];
  if (!side) return all;
  return all.filter((e) => e.dataset.side === side);
}

function cssEscape(s) {
  // data-key values are simple; escape backslash and quote for the selector.
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function clearHighlight() {
  while (highlighted.length) highlighted.pop().classList.remove('kb-next', 'kb-next-shift');
}

// Highlight the base key for `token`, plus the correct Shift if needed.
export function highlightToken(token) {
  clearHighlight();
  if (!token || !container) return;
  const base = baseKeyId(token);
  for (const el of keyEls(base)) {
    el.classList.add('kb-next');
    highlighted.push(el);
  }
  if (token.needsShift) {
    const side = token.shiftSide === 'ShiftLeft' ? 'Left' : 'Right';
    for (const el of keyEls('Shift', side)) {
      el.classList.add('kb-next-shift');
      highlighted.push(el);
    }
  }
}

// Brief error flash on the key the user should have pressed.
export function flashError(token) {
  const base = baseKeyId(token);
  for (const el of keyEls(base)) {
    el.classList.add('kb-error');
    setTimeout(() => el.classList.remove('kb-error'), 220);
  }
}

function baseKeyId(token) {
  if (token.type === 'special') return token.expected; // 'Tab','Shift','Meta',...
  if (token.expected === ' ') return ' ';
  // char: map to the physical (unshifted) key
  const ch = token.expected;
  if (ch in SHIFT_MAP) return SHIFT_MAP[ch];
  if (/[A-Z]/.test(ch)) return ch.toLowerCase();
  return ch;
}

// For the text hint under the prompt: which finger (+ shift note).
export function fingerHint(token) {
  const f = fingerFor(baseKeyId(token));
  let text = fingerName(f) || '';
  if (token.needsShift) {
    const side = token.shiftSide === 'ShiftLeft' ? 'left' : 'right';
    text += ` + ${side} Shift (${side === 'left' ? 'left' : 'right'} pinky)`;
  }
  return text;
}
