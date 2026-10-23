// Label files: which finger REALLY pressed each key in a recording.
//
// A recording "typing-recording-X.json" is labeled by "typing-recording-X.labels.json"
// next to it. Keys are numbered from 1 in the order they were pressed (run
// `npm run evaluate -- --list <recording>` to see the numbers).
//
// {
//   "typist": "Ahmed",
//   "notes": "Level 1 drill. Keys 1-20 typed with the right index on purpose.",
//   "default": "expected",            every key not listed below: the finger fingerMap.js expects
//                                     ("unknown" = not labeled, or a finger ID like "R_INDEX")
//   "fingers": [
//     { "keys": "1-20", "finger": "R_INDEX" },
//     { "keys": "23, 25", "finger": "L_MIDDLE" }
//   ],
//   "skip": "5, 30-32"                keys to leave out (you are not sure, or it was a slip)
// }
//
// Labels describe what the typist DID. They come from people, never from code.

import { existsSync, readFileSync } from "node:fs";
import { expectedFingers, isFingerId } from "../../js/fingerMap.js";

export function labelsPathFor(recordingPath) {
  return recordingPath.replace(/\.json$/i, "") + ".labels.json";
}

/** "1-3, 7" -> [1, 2, 3, 7]. Throws a readable error on anything else. */
export function parseKeyList(text) {
  if (text == null || String(text).trim() === "") return [];
  const numbers = [];
  for (const part of String(text).split(",")) {
    const piece = part.trim();
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(piece);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      if (from < 1 || to < from) throw new Error(`Bad key range "${piece}" (key numbers start at 1)`);
      for (let n = from; n <= to; n += 1) numbers.push(n);
    } else if (/^\d+$/.test(piece) && Number(piece) >= 1) {
      numbers.push(Number(piece));
    } else {
      throw new Error(`Bad key number "${piece}" (use numbers like "4" or ranges like "1-20")`);
    }
  }
  return numbers;
}

function checkFingerValue(value, where) {
  if (value === "expected" || value === "unknown" || isFingerId(value)) return;
  throw new Error(`${where}: "${value}" is not "expected", "unknown" or a finger ID like "L_INDEX"`);
}

/** Read and check a labels file. Returns null when the file does not exist. */
export function loadLabels(labelsPath) {
  if (!existsSync(labelsPath)) return null;
  let labels;
  try {
    labels = JSON.parse(readFileSync(labelsPath, "utf8"));
  } catch (error) {
    throw new Error(`${labelsPath} is not valid JSON: ${error.message}`);
  }
  validateLabels(labels, labelsPath);
  return labels;
}

export function validateLabels(labels, where = "labels") {
  if (!labels || typeof labels !== "object") throw new Error(`${where}: must be a JSON object`);
  checkFingerValue(labels.default ?? "unknown", `${where} "default"`);
  if (labels.fingers !== undefined && !Array.isArray(labels.fingers)) throw new Error(`${where}: "fingers" must be a list`);
  for (const [i, entry] of (labels.fingers ?? []).entries()) {
    checkFingerValue(entry?.finger, `${where} "fingers" item ${i + 1}`);
    parseKeyList(entry.keys);
  }
  parseKeyList(labels.skip);
}

/**
 * The true finger(s) for every key event, in order.
 * @returns {Array<string[]|null>}  null = unlabeled or skipped. Space typed
 *   "expected" gives both thumbs, because either is correct.
 */
export function resolveLabels(keyEvents, labels) {
  const perKey = new Map();
  for (const entry of labels.fingers ?? []) {
    for (const n of parseKeyList(entry.keys)) perKey.set(n, entry.finger);
  }
  const skipped = new Set(parseKeyList(labels.skip));
  const tooHigh = [...perKey.keys(), ...skipped].filter((n) => n > keyEvents.length);
  if (tooHigh.length > 0) {
    throw new Error(`Labels mention key ${Math.max(...tooHigh)}, but the recording has only ${keyEvents.length} keys`);
  }
  return keyEvents.map((keyEvent, i) => {
    const n = i + 1;
    if (skipped.has(n)) return null;
    const value = perKey.get(n) ?? labels.default ?? "unknown";
    if (value === "unknown") return null;
    if (value === "expected") {
      const expected = expectedFingers(keyEvent.code);
      return expected.length > 0 ? expected : null;
    }
    return [value];
  });
}

/** Group sorted key numbers into the "1-3, 7" text parseKeyList reads. */
export function formatKeyList(numbers) {
  const parts = [];
  let start = null;
  let previous = null;
  for (const n of numbers) {
    if (start !== null && n === previous + 1) {
      previous = n;
      continue;
    }
    if (start !== null) parts.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = n;
    previous = n;
  }
  if (start !== null) parts.push(start === previous ? `${start}` : `${start}-${previous}`);
  return parts.join(", ");
}

/**
 * Write per-key truths back as a compact labels object (used when trimming a
 * recording into a test fixture, which renumbers the keys).
 * @param {Array<{code: string}>} keyEvents
 * @param {Array<string[]|null>} truths  from resolveLabels, one per key
 */
export function labelsFromTruths(keyEvents, truths, extra = {}) {
  const byFinger = new Map();
  const skip = [];
  truths.forEach((truth, i) => {
    const n = i + 1;
    if (truth === null) {
      skip.push(n);
      return;
    }
    const expected = expectedFingers(keyEvents[i].code);
    const sameAsExpected = truth.length === expected.length && truth.every((f) => expected.includes(f));
    if (sameAsExpected) return;
    const finger = truth[0];
    if (!byFinger.has(finger)) byFinger.set(finger, []);
    byFinger.get(finger).push(n);
  });
  return {
    ...extra,
    default: "expected",
    fingers: [...byFinger.entries()].map(([finger, numbers]) => ({ keys: formatKeyList(numbers), finger })),
    skip: formatKeyList(skip),
  };
}
