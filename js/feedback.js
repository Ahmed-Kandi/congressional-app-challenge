// Turns the result of the team's attributeKeystroke() into what the student
// sees: a green or red fingertip flash on the overlay plus a sentence of text.
//
// This file only COMPARES the finger the team's function reported with the
// finger the map expects. It never decides which finger pressed a key.

import { MIN_ATTRIBUTION_CONFIDENCE } from "./config.js";
import { describeFingers, fingerLabel, isFingerId } from "./fingerMap.js";

/**
 * Call the team's function safely. A thrown error or a malformed result is
 * treated as "no answer" so a bug there can never break typing practice.
 * @returns {{result: object|null, problem: string|null}}
 */
export function runAttribution(attributeKeystroke, keyEvent, frames, calibration) {
  let result;
  try {
    result = attributeKeystroke(keyEvent, frames, calibration);
  } catch (error) {
    return { result: null, problem: `attributeKeystroke threw: ${error?.message ?? error}` };
  }
  if (result == null) return { result: null, problem: null };
  if (typeof result !== "object" || !isFingerId(result.finger)) {
    return { result: null, problem: `attributeKeystroke returned an unknown finger: ${JSON.stringify(result?.finger)}` };
  }
  if (typeof result.confidence !== "number" || !(result.confidence >= 0 && result.confidence <= 1)) {
    return { result: null, problem: `attributeKeystroke returned a confidence outside 0..1: ${result.confidence}` };
  }
  return { result, problem: null };
}

/**
 * Compare a validated result with the fingers the key expects.
 * @param {{finger: string, confidence: number}|null} result
 * @param {string[]} expected  from expectedFingers(code)
 * @returns {{status: "correct"|"wrong"|"unavailable", used: string|null, confidence: number|null}}
 */
export function evaluateAttribution(result, expected) {
  if (!result || expected.length === 0 || result.confidence < MIN_ATTRIBUTION_CONFIDENCE) {
    return { status: "unavailable", used: null, confidence: result?.confidence ?? null };
  }
  const status = expected.includes(result.finger) ? "correct" : "wrong";
  return { status, used: result.finger, confidence: result.confidence };
}

/** How a character reads in a sentence: a space is invisible, so name it. */
function charName(char) {
  return char === " " ? "Space" : `"${char}"`;
}

/**
 * The sentence for a typo. A finger verdict there would confuse: "Correct
 * finger" on the wrong letter reads like praise, so the screen talks about
 * the key instead. (The finger check is still stored for the summary.)
 */
export function wrongKeyMessage(typedChar, targetChar) {
  return `Wrong key: you typed ${charName(typedChar)}, the text needs ${charName(targetChar)}.`;
}

/** The sentence shown to the student. Never relies on color: it says right or wrong in words. */
export function feedbackMessage(check, expected) {
  switch (check.status) {
    case "correct":
      return `Correct finger: ${fingerLabel(check.used)}.`;
    case "wrong":
      return `Wrong finger: used ${fingerLabel(check.used)}, should be ${describeFingers(expected)}.`;
    default:
      return "Finger check unavailable.";
  }
}

/**
 * Show a finger check on screen.
 * @param {{textElement: HTMLElement, overlay: import('./overlay.js').Overlay}} targets
 */
/**
 * Which beat flash a keystroke gets: "good" only when the key AND the finger
 * were right, "bad" for a wrong key or a wrong finger, and null when the
 * finger check is unsure, so a guess never flashes red at the student.
 */
export function beatKind(keystroke, check) {
  if (keystroke.kind !== "char") return null;
  if (!keystroke.correct) return "bad";
  if (check?.status === "correct") return "good";
  if (check?.status === "wrong") return "bad";
  return null;
}

/** Show a typo instead of a finger check (no fingertip flash). */
export function showWrongKey({ textElement, overlay }, typedChar, targetChar) {
  textElement.textContent = wrongKeyMessage(typedChar, targetChar);
  textElement.dataset.status = "wrong-key";
  overlay.clearFlash();
}

export function showFingerCheck({ textElement, overlay }, check, expected) {
  textElement.textContent = feedbackMessage(check, expected);
  textElement.dataset.status = check.status;
  if (check.status === "unavailable") overlay.clearFlash();
  else overlay.flash(check.used, check.status === "correct");
}
