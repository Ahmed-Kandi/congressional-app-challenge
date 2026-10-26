// One typing session: tracks what was typed, computes WPM and accuracy, and
// builds the end-of-session summary. Pure logic, no DOM, so it is unit tested.

import {
  CHARS_PER_WORD,
  HEADLINE_KEYSTROKE_SHARE,
  TOP_SUBSTITUTION_COUNT,
} from "./config.js";
import { FINGERS, describeFingers, expectedFingers, fingerLabel } from "./fingerMap.js";

// ---------- Small math helpers (each tested with hand-worked examples) ----------

/** Words per minute: one word is CHARS_PER_WORD characters. 0 when no time has passed. */
export function computeWpm(correctChars, elapsedMs) {
  if (elapsedMs <= 0) return 0;
  return correctChars / CHARS_PER_WORD / (elapsedMs / 60000);
}

/** Fraction correct, or null when there is nothing to measure yet. */
export function computeAccuracy(correct, total) {
  return total > 0 ? correct / total : null;
}

/**
 * Smallest number of fingers that together made at least `share` of the keystrokes.
 * counts: { L_INDEX: 40, R_INDEX: 35, ... }. Returns null when there are no keystrokes.
 */
export function fingersCoveringShare(counts, share = HEADLINE_KEYSTROKE_SHARE) {
  const sorted = Object.values(counts).filter((n) => n > 0).sort((a, b) => b - a);
  const total = sorted.reduce((sum, n) => sum + n, 0);
  if (total === 0) return null;
  let covered = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    covered += sorted[i];
    // Small epsilon so 9/10 counts as reaching 0.9 despite float rounding.
    if (covered / total >= share - 1e-9) return i + 1;
  }
  return sorted.length;
}

/**
 * The most common (should have used -> actually used) mix-ups.
 * @param {Array<{expected: string[], used: string}>} wrongKeystrokes
 * @returns {Array<{expected: string, used: string, count: number}>} labels, most common first
 */
export function topSubstitutions(wrongKeystrokes, limit = TOP_SUBSTITUTION_COUNT) {
  const counts = new Map();
  for (const { expected, used } of wrongKeystrokes) {
    const key = `${describeFingers(expected)}|${fingerLabel(used)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [expectedLabel, usedLabel] = key.split("|");
      return { expected: expectedLabel, used: usedLabel, count };
    })
    // Most common first; ties broken alphabetically so the order is stable.
    .sort((a, b) => b.count - a.count || a.expected.localeCompare(b.expected) || a.used.localeCompare(b.used))
    .slice(0, limit);
}

function emptyFingerCounts() {
  return Object.fromEntries(FINGERS.map((finger) => [finger, 0]));
}

// ---------- The session ----------

export class TypingSession {
  /**
   * @param {string} targetText  what the student should type
   * @param {{levelId?: number, exerciseIndex?: number}} info
   */
  constructor(targetText, info = {}) {
    this.targetText = targetText;
    this.levelId = info.levelId ?? null;
    this.exerciseIndex = info.exerciseIndex ?? null;
    this.typed = []; // [{ char, correct }] what is on screen now (Backspace removes)
    this.keystrokes = []; // every counted key press, never removed
    this.firstCharTime = null;
    this.lastCharTime = null;
    this.nextKeystrokeId = 1;
  }

  get position() {
    return this.typed.length;
  }

  get isComplete() {
    return this.typed.length >= this.targetText.length;
  }

  /** The character the student should type next, or null when finished. */
  get nextChar() {
    return this.isComplete ? null : this.targetText[this.typed.length];
  }

  /**
   * Feed a key press. Returns the stored keystroke, or null if the key does not
   * count (Shift on its own, arrows, keys after the end).
   */
  handleKey({ code, key, t }) {
    if (this.isComplete) return null;

    if (code === "Backspace") {
      if (this.typed.length === 0) return null;
      this.typed.pop();
      return this.addKeystroke({ code, key, t, kind: "backspace", correct: null, targetChar: null });
    }

    // Only keys that type exactly one character count (letters, digits, space, punctuation).
    if (typeof key !== "string" || key.length !== 1) return null;

    const targetChar = this.targetText[this.typed.length];
    const correct = key === targetChar;
    this.typed.push({ char: key, correct });
    this.firstCharTime ??= t;
    this.lastCharTime = t;
    return this.addKeystroke({ code, key, t, kind: "char", correct, targetChar });
  }

  addKeystroke(fields) {
    const keystroke = {
      id: this.nextKeystrokeId++,
      ...fields,
      expectedFingers: expectedFingers(fields.code),
      // Filled in later by recordFingerCheck(): "pending" until then.
      fingerCheck: { status: "pending", used: null, confidence: null },
    };
    this.keystrokes.push(keystroke);
    return keystroke;
  }

  /**
   * Store the finger check result for a keystroke.
   * @param {number} keystrokeId
   * @param {{status: "correct"|"wrong"|"unavailable", used: string|null, confidence: number|null}} check
   */
  recordFingerCheck(keystrokeId, check) {
    const keystroke = this.keystrokes.find((k) => k.id === keystrokeId);
    if (keystroke) keystroke.fingerCheck = check;
  }

  charKeystrokes() {
    return this.keystrokes.filter((k) => k.kind === "char");
  }

  correctCharsOnScreen() {
    return this.typed.filter((entry) => entry.correct).length;
  }

  /** Stats while typing. `now` is performance.now() (same clock as key events). */
  liveStats(now) {
    const chars = this.charKeystrokes();
    const end = this.isComplete ? this.lastCharTime : now;
    const elapsed = this.firstCharTime == null ? 0 : end - this.firstCharTime;
    return {
      wpm: computeWpm(this.correctCharsOnScreen(), elapsed),
      accuracy: computeAccuracy(chars.filter((k) => k.correct).length, chars.length),
      typedCount: this.typed.length,
    };
  }

  /** Everything the summary screen shows. */
  summary() {
    const chars = this.charKeystrokes();
    const elapsedMs = this.firstCharTime == null ? 0 : this.lastCharTime - this.firstCharTime;
    const checked = this.keystrokes.filter((k) => k.fingerCheck.status === "correct" || k.fingerCheck.status === "wrong");
    const wrong = checked.filter((k) => k.fingerCheck.status === "wrong");

    const usedCounts = emptyFingerCounts();
    for (const k of checked) usedCounts[k.fingerCheck.used] += 1;

    // Keep camera-checked accuracy for the finger responsible for each key.
    // Space accepts either thumb, so its result is split evenly between them.
    const fingerAccuracyByFinger = Object.fromEntries(FINGERS.map((finger) => [finger, { correct: 0, total: 0 }]));
    for (const keystroke of checked) {
      const expected = keystroke.expectedFingers;
      if (expected.length === 0) continue;
      const share = 1 / expected.length;
      for (const finger of expected) {
        fingerAccuracyByFinger[finger].total += share;
        if (keystroke.fingerCheck.status === "correct") fingerAccuracyByFinger[finger].correct += share;
      }
    }

    const fingerCheckAvailable = checked.length > 0;
    return {
      levelId: this.levelId,
      exerciseIndex: this.exerciseIndex,
      targetText: this.targetText,
      elapsedMs,
      wpm: computeWpm(this.correctCharsOnScreen(), elapsedMs),
      charAccuracy: computeAccuracy(chars.filter((k) => k.correct).length, chars.length),
      keystrokeCount: this.keystrokes.length,
      fingerCheckAvailable,
      fingerAccuracy: fingerCheckAvailable ? (checked.length - wrong.length) / checked.length : null,
      fingerAccuracyByFinger,
      fingersFor90Percent: fingerCheckAvailable ? fingersCoveringShare(usedCounts) : null,
      histogram: fingerCheckAvailable ? usedFingerHistogram(usedCounts) : expectedFingerHistogram(this.keystrokes),
      topSubstitutions: topSubstitutions(wrong.map((k) => ({ expected: k.expectedFingers, used: k.fingerCheck.used }))),
    };
  }
}

/** Histogram bars from fingers the camera saw being used: one bar per finger. */
export function usedFingerHistogram(usedCounts) {
  return FINGERS.map((finger) => ({ id: finger, label: fingerLabel(finger), count: usedCounts[finger] ?? 0 }));
}

/**
 * Histogram bars from the keys pressed (which finger SHOULD have pressed them).
 * Used when the finger check is not available. The space bar can be either
 * thumb, so both thumbs share one "either thumb" bar.
 */
export function expectedFingerHistogram(keystrokes) {
  const counts = emptyFingerCounts();
  let eitherThumb = 0;
  for (const k of keystrokes) {
    if (k.expectedFingers.length === 1) counts[k.expectedFingers[0]] += 1;
    else if (k.expectedFingers.length === 2) eitherThumb += 1;
  }
  const bars = [];
  for (const finger of FINGERS) {
    if (finger === "L_THUMB") bars.push({ id: "THUMB", label: "either thumb", count: eitherThumb });
    else if (finger !== "R_THUMB") bars.push({ id: finger, label: fingerLabel(finger), count: counts[finger] });
  }
  return bars;
}
