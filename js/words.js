// words.js — bundled word/sentence corpus + letter-mask filtering.
//
// Imports only the static literary corpus (another leaf). Powers the
// words → sentences fluency phase. A word/sentence is only ever shown if every
// character is a key the learner has already mastered (filtering lives here for
// words; sentences are filtered in engine.js, which knows pool/mastery state).

import { LITERARY } from './literary.js';

// ~260 common English words, roughly frequency-ordered. All /^[a-z]{1,8}$/ — no
// apostrophes, hyphens, or capitals; no duplicates. ('i' dropped, 'a' kept.)
export const WORDS = [
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it',
  'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this',
  'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or',
  'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so',
  'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when',
  'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take', 'people',
  'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than',
  'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back',
  'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even',
  'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'is',
  'was', 'are', 'been', 'has', 'had', 'were', 'said', 'did', 'made', 'find',
  'here', 'thing', 'many', 'such', 'long', 'high', 'every', 'part', 'place', 'right',
  'great', 'small', 'large', 'next', 'early', 'young', 'few', 'last', 'own', 'under',
  'water', 'never', 'again', 'off', 'away', 'still', 'life', 'world', 'school', 'house',
  'hand', 'eye', 'word', 'name', 'home', 'week', 'side', 'kind', 'head', 'far',
  'once', 'while', 'help', 'talk', 'turn', 'move', 'live', 'show', 'play', 'run',
  'walk', 'open', 'close', 'read', 'write', 'hear', 'grow', 'keep', 'begin', 'seem',
  'feel', 'try', 'ask', 'need', 'call', 'tell', 'become', 'leave', 'put', 'mean',
  'let', 'must', 'child', 'group', 'story', 'fact', 'money', 'month', 'book', 'paper',
  'room', 'friend', 'night', 'point', 'family', 'light', 'idea', 'body', 'car', 'city',
  'game', 'line', 'end', 'food', 'tree', 'song', 'road', 'door', 'fire', 'plan',
  'love', 'hope', 'true', 'best', 'sure', 'able', 'free', 'real', 'full', 'hard',
  'easy', 'late', 'left', 'less', 'more', 'much', 'near', 'pure', 'poor', 'rich',
  'safe', 'same', 'slow', 'soft', 'warm', 'wide', 'wild', 'wise', 'blue', 'cold',
  'dark', 'deep', 'fast', 'fine', 'gold', 'green', 'nice', 'pink', 'red', 'white',
  'add', 'boat', 'bird', 'cat', 'dog', 'egg', 'farm', 'fish', 'hill', 'king',
];

// ~48 everyday sentences. The first 36 use ONLY letters, capitals, space, comma,
// and period, so they are all eligible the moment sentences unlock. The last dozen
// may additionally use apostrophes, ! or ? (eligible after those keys unlock).
export const SENTENCES = [
  'The quick brown fox jumps over the lazy dog.',
  'She said the meeting starts at noon today.',
  'We walked along the river until the sun went down.',
  'My brother reads a book every single night.',
  'The old house on the hill has a red door.',
  'They planted trees near the school last spring.',
  'A gentle rain fell over the quiet town.',
  'He kept the light on while he wrote his story.',
  'Our team worked hard and finished the plan early.',
  'The children played games in the open field.',
  'I hope you find the time to visit us soon.',
  'Water flows down the long river to the sea.',
  'The teacher asked the class to open their books.',
  'A small bird sang in the tall green tree.',
  'We had a great time at the party last week.',
  'She kept her word and helped us move the boxes.',
  'The city lights looked bright from the high hill.',
  'He learned to play the song in just one day.',
  'They live in a warm house near the blue lake.',
  'The dog ran across the yard to greet the boy.',
  'Please turn off the light before you leave.',
  'My family likes to walk in the park on weekends.',
  'The fast train left the station right on time.',
  'We read the same book and talked about it for hours.',
  'A good friend will always tell you the truth.',
  'The bright moon rose above the dark hills.',
  'She wrote her name at the top of the page.',
  'The farm has cows, sheep, and a small red barn.',
  'He put the keys on the table by the door.',
  'They watched the boats sail out past the shore.',
  'The soft wind moved the leaves across the road.',
  'We made a fire and told stories late into the night.',
  'The young girl drew a picture of her home.',
  'A wise leader listens more than she speaks.',
  'The store closes early on the last day of the week.',
  'He fixed the old clock and set it to the right time.',
  'What time does the next train leave the city?',
  'Can you help me carry these books upstairs?',
  'That was the best meal we have had all year!',
  'Where did you put the map of the old town?',
  'The band played on, and the whole crowd cheered!',
  'Do you know the way to the river from here?',
  'It is a bright, clear morning for a long walk.',
  'She smiled and said, that is a wonderful idea!',
  'How many people are coming to the party tonight?',
  'The waves crashed hard against the rocks below.',
  'We finally reached the top, and the view was amazing!',
  'Why do the best days always seem to pass so fast?',
].concat(LITERARY);   // + ~240 interesting literary passages (variety, so adaptive stops cycling)

// --- letter-mask filtering ----------------------------------------------------
// 'a' -> bit 0 ... 'z' -> bit 25. A word is eligible for a set of allowed letters
// iff every letter bit is within the allowed mask: (wordMask & ~allowed) === 0.

export function maskFor(letters) {
  let m = 0;
  for (const ch of letters) {
    const c = ch.charCodeAt(0) - 97;
    if (c >= 0 && c < 26) m |= (1 << c);
  }
  return m;
}

export function wordMask(word) { return maskFor(word); }

let _masks = null;                 // Int32Array parallel to WORDS, built lazily
const _eligibleCache = new Map();  // allowedMask -> eligible word array (freq order)

function ensureMasks() {
  if (_masks) return;
  _masks = new Int32Array(WORDS.length);
  for (let i = 0; i < WORDS.length; i++) _masks[i] = maskFor(WORDS[i]);
}

// allowed: a bitmask, or any iterable of 'a'..'z'. Returns eligible words in the
// original (frequency) order. Memoized — the mastered-letter set changes rarely.
export function eligibleWords(allowed) {
  const mask = (typeof allowed === 'number') ? allowed : maskFor(allowed);
  if (_eligibleCache.has(mask)) return _eligibleCache.get(mask);
  ensureMasks();
  const out = [];
  for (let i = 0; i < WORDS.length; i++) {
    if ((_masks[i] & ~mask) === 0) out.push(WORDS[i]);
  }
  _eligibleCache.set(mask, out);
  return out;
}
