// notify.js — a minimal transient banner for in-session events (a new key being
// introduced, a level completed). No dependencies. Messages are queued so that
// simultaneous events (e.g. "mastered" + "level up") don't overwrite each other.

let el = null;
const queue = [];
let showing = false;
let hideTimer = null;

export function initNotify(node) { el = node; }

export function notify(message, { duration = 4000 } = {}) {
  queue.push({ message, duration });
  if (!showing) drain();
}

function drain() {
  if (!el || !queue.length) { showing = false; return; }
  showing = true;
  const { message, duration } = queue.shift();
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(drain, 300);   // let it fade out before the next message
  }, duration);
}
