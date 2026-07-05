// session.js — a timed practice session: countdown, live WPM/accuracy, and an
// end-of-session summary that gets logged to Stats.

import * as Stats from './stats.js';
import { weakest, maybeAdvanceStage } from './engine.js';

export function createSession({ minutes, onTick, onEnd }) {
  const durationMs = Math.round(minutes * 60000);
  let startTs = 0;
  let timer = null;
  let running = false;

  // tallies
  let correctChars = 0;   // correct character keystrokes (drives WPM)
  let attempts = 0;       // all judged keystrokes
  let errors = 0;

  function elapsed() { return running ? Date.now() - startTs : 0; }
  function remaining() { return Math.max(0, durationMs - elapsed()); }

  function liveStats() {
    const wpm = Stats.computeWpm(correctChars, Math.max(1, elapsed()));
    const accuracy = attempts ? (attempts - errors) / attempts : 1;
    return { remainingMs: remaining(), elapsedMs: elapsed(), wpm, accuracy,
      chars: correctChars, attempts, errors };
  }

  function tick() {
    if (!running) return;
    if (onTick) onTick(liveStats());
    if (remaining() <= 0) finish();
  }

  function finish() {
    if (!running) return;
    running = false;
    if (timer) { clearInterval(timer); timer = null; }
    const dur = Math.min(elapsed(), durationMs);
    const wpm = Stats.computeWpm(correctChars, Math.max(1, dur));
    const accuracy = attempts ? (attempts - errors) / attempts : 1;
    const summary = {
      durationMs: dur, chars: correctChars, correct: correctChars,
      attempts, errors, wpm, accuracy,
    };
    Stats.recordSession(summary);
    const advancedTo = maybeAdvanceStage();
    Stats.save();
    if (onEnd) {
      onEnd({ ...summary, weakest: weakest(6), streak: Stats.currentStreak(), advancedTo });
    }
  }

  return {
    start() {
      startTs = Date.now();
      running = true;
      timer = setInterval(tick, 250);
      tick();
    },
    // Feed one judged keystroke from app.js.
    recordResult(correct, isCharacter) {
      if (!running) return;
      attempts += 1;
      if (!correct) errors += 1;
      else if (isCharacter) correctChars += 1;
    },
    stop() { finish(); },
    abort() {
      running = false;
      if (timer) { clearInterval(timer); timer = null; }
    },
    isRunning() { return running; },
    liveStats,
  };
}
