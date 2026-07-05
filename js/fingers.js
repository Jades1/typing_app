// fingers.js — key -> finger mapping for a Mac QWERTY keyboard.
//
// Fingers are mirrored across hands (both pinkies share a color, etc.), which is
// the standard touch-typing colour scheme (à la TypingClub). A key id is either a
// single lowercase character, a digit/symbol as printed on the key, or a named
// special key ("Tab", "Shift", "Meta", "Control", "Alt", "Enter", "Backspace",
// "CapsLock", " ").

export const FINGERS = {
  LP: { name: 'Left pinky',   hand: 'left',  color: '#e8833a' },
  LR: { name: 'Left ring',    hand: 'left',  color: '#e8c34a' },
  LM: { name: 'Left middle',  hand: 'left',  color: '#5bb98c' },
  LI: { name: 'Left index',   hand: 'left',  color: '#4aa3df' },
  LT: { name: 'Left thumb',   hand: 'left',  color: '#a98cd8' },
  RT: { name: 'Right thumb',  hand: 'right', color: '#a98cd8' },
  RI: { name: 'Right index',  hand: 'right', color: '#4aa3df' },
  RM: { name: 'Right middle', hand: 'right', color: '#5bb98c' },
  RR: { name: 'Right ring',   hand: 'right', color: '#e8c34a' },
  RP: { name: 'Right pinky',  hand: 'right', color: '#e8833a' },
};

// Base (unshifted) key id -> finger. Shifted symbols inherit their base key's
// finger via SHIFT_MAP below.
export const KEY_FINGER = {
  // number row
  '`': 'LP', '1': 'LP', '2': 'LR', '3': 'LM', '4': 'LI', '5': 'LI',
  '6': 'RI', '7': 'RI', '8': 'RM', '9': 'RR', '0': 'RP', '-': 'RP', '=': 'RP',
  // top row
  q: 'LP', w: 'LR', e: 'LM', r: 'LI', t: 'LI',
  y: 'RI', u: 'RI', i: 'RM', o: 'RR', p: 'RP', '[': 'RP', ']': 'RP', '\\': 'RP',
  // home row
  a: 'LP', s: 'LR', d: 'LM', f: 'LI', g: 'LI',
  h: 'RI', j: 'RI', k: 'RM', l: 'RR', ';': 'RP', "'": 'RP',
  // bottom row
  z: 'LP', x: 'LR', c: 'LM', v: 'LI', b: 'LI',
  n: 'RI', m: 'RI', ',': 'RM', '.': 'RR', '/': 'RP',
  // specials
  ' ': 'RT',        // space bar — either thumb; we default to right
  Tab: 'LP',
  CapsLock: 'LP',
  Shift: 'LP',      // generic; use whichShift() to pick the opposite hand
  Enter: 'RP',
  Backspace: 'RP',
  Control: 'LP',
  Alt: 'LP',        // Option — reached with the pinky
  Meta: 'LT',       // Command — pressed with the thumb
};

// Shifted symbol -> the base key you press with Shift. Used both to find the
// finger for a symbol and to know a Shift is required to produce it.
export const SHIFT_MAP = {
  '~': '`', '!': '1', '@': '2', '#': '3', '$': '4', '%': '5',
  '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', '_': '-', '+': '=',
  '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/',
};

// Digits paired with the symbol printed above them (for number/symbol drills).
export const NUMBER_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
export const SYMBOLS = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')',
  '-', '_', '=', '+', '[', ']', '{', '}', ';', ':', "'", '"',
  ',', '<', '.', '>', '/', '?', '`', '~', '\\', '|'];

// Named special keys we train individually, with the label to display.
export const SPECIAL_KEYS = [
  { id: 'Tab',     label: 'Tab' },
  { id: 'Shift',   label: 'Shift' },
  { id: 'Control', label: 'Control' },
  { id: 'Alt',     label: 'Option' },
  { id: 'Meta',    label: 'Command' },
];

// Does producing this character require holding Shift?
export function needsShift(ch) {
  return ch.length === 1 && (ch in SHIFT_MAP || (/[A-Z]/.test(ch)));
}

// The base key you physically press to produce `ch` (letter or symbol).
export function baseKey(ch) {
  if (ch.length === 1) {
    if (ch in SHIFT_MAP) return SHIFT_MAP[ch];
    if (/[A-Z]/.test(ch)) return ch.toLowerCase();
  }
  return ch;
}

// Finger id for a key id / character. Handles uppercase letters and symbols.
export function fingerFor(keyId) {
  const base = baseKey(keyId);
  return KEY_FINGER[base] ?? null;
}

// Human label, e.g. "Left pinky".
export function fingerName(fingerId) {
  return FINGERS[fingerId]?.name ?? '';
}

// When a char needs Shift, use the Shift on the OPPOSITE hand from the base key.
// Returns 'ShiftLeft' | 'ShiftRight' | null.
export function whichShift(ch) {
  if (!needsShift(ch)) return null;
  const f = fingerFor(baseKey(ch));
  const hand = FINGERS[f]?.hand;
  return hand === 'left' ? 'ShiftRight' : 'ShiftLeft';
}
