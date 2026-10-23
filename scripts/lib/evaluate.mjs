// Score attributeKeystroke() against labeled recordings.
//
// For each key press we rebuild exactly what the app would hand the function:
// it is called ATTRIBUTION_DELAY_MS after the key, and by then only frames that
// have ARRIVED are in the buffer (a frame shot at time t arrives about
// frameLagMs later). Then we compare its answer with the label.
//
// This file only compares answers with labels. It never decides a finger.

import { performance } from "node:perf_hooks";
import { ATTRIBUTION_DELAY_MS, FRAME_BUFFER_WINDOW_MS, MIN_ATTRIBUTION_CONFIDENCE } from "../../js/config.js";
import { evaluateAttribution, runAttribution } from "../../js/feedback.js";
import { expectedFingers, fingerLabel } from "../../js/fingerMap.js";
import { FrameBuffer } from "../../js/frameBuffer.js";

export const CONFIDENCE_SWEEP = [0.5, 0.6, 0.7, 0.8, 0.9];

/** Index of the first frame with t > limit (frames are sorted by t). */
function firstAfter(frames, limit) {
  let low = 0;
  let high = frames.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (frames[mid].t <= limit) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** The frame buffer the app would have when it asks about this key. */
export function bufferAtCallTime(frames, keyEvent, { delayMs = ATTRIBUTION_DELAY_MS, arrivalLagMs = 0 } = {}) {
  const newestShot = keyEvent.t + delayMs - arrivalLagMs;
  const end = firstAfter(frames, newestShot);
  // Push a little more than the window; the buffer drops what it would have
  // dropped in the app (anything older than its window before its newest frame).
  const start = firstAfter(frames, newestShot - FRAME_BUFFER_WINDOW_MS - 1000);
  const buffer = new FrameBuffer();
  for (let i = start; i < end; i += 1) buffer.push(frames[i]);
  return buffer;
}

/**
 * Run the function on every key of one recording.
 * @param {object} recording  parsed recording JSON
 * @param {Array<string[]|null>} truths  from resolveLabels (null = not scored)
 * @param {Function} attributeKeystroke
 * @param {object} options  { calibration, delayMs, arrivalLagMs }
 * @returns {Array<object>} one row per key event
 */
export function evaluateRecording(recording, truths, attributeKeystroke, options = {}) {
  const frames = [...recording.frames].sort((a, b) => a.t - b.t);
  const calibration = options.calibration === undefined ? recording.meta?.calibration ?? null : options.calibration;
  return recording.keyEvents.map((keyEvent, i) => {
    const expected = expectedFingers(keyEvent.code);
    const truth = truths[i] ?? null;
    const buffer = bufferAtCallTime(frames, keyEvent, options);
    const started = performance.now();
    const { result, problem } = runAttribution(attributeKeystroke, keyEvent, buffer, calibration);
    const ms = performance.now() - started;
    const check = evaluateAttribution(result, expected);
    const scored = truth !== null && expected.length > 0;
    return {
      number: i + 1,
      code: keyEvent.code,
      key: keyEvent.key,
      t: keyEvent.t,
      expected,
      truth,
      scored,
      result: result ? { finger: result.finger, confidence: result.confidence } : null,
      problem,
      answered: check.status !== "unavailable",
      // What the student would be told, and what they should have been told.
      shown: check.status,
      deserved: scored ? (truth.every((f) => expected.includes(f)) ? "correct" : "wrong") : null,
      fingerRight: scored && result ? truth.includes(result.finger) : null,
      ms,
    };
  });
}

const ratio = (part, whole) => (whole === 0 ? null : part / whole);

/** Turn rows (from one or many recordings) into the numbers worth reporting. */
export function summarize(rows) {
  const scored = rows.filter((r) => r.scored);
  const answered = scored.filter((r) => r.answered);
  const right = answered.filter((r) => r.fingerRight);
  const goodForm = answered.filter((r) => r.deserved === "correct");
  const badForm = answered.filter((r) => r.deserved === "wrong");

  const confusions = new Map();
  for (const r of answered.filter((row) => !row.fingerRight)) {
    const pair = `${r.truth.map(fingerLabel).join(" or ")} -> ${fingerLabel(r.result.finger)}`;
    confusions.set(pair, (confusions.get(pair) ?? 0) + 1);
  }

  const byFinger = {};
  for (const r of scored) {
    const name = r.truth.length > 1 ? "either thumb" : fingerLabel(r.truth[0]);
    byFinger[name] ??= { keys: 0, answered: 0, right: 0 };
    byFinger[name].keys += 1;
    if (r.answered) byFinger[name].answered += 1;
    if (r.answered && r.fingerRight) byFinger[name].right += 1;
  }

  // What coverage and accuracy would be with a stricter confidence cutoff.
  const sweep = CONFIDENCE_SWEEP.map((cutoff) => {
    const kept = scored.filter((r) => r.result && r.result.confidence >= cutoff);
    return { cutoff, coverage: ratio(kept.length, scored.length), accuracy: ratio(kept.filter((r) => r.fingerRight).length, kept.length) };
  });

  const times = rows.map((r) => r.ms);
  return {
    keys: rows.length,
    scored: scored.length,
    answered: answered.length,
    coverage: ratio(answered.length, scored.length),
    fingerAccuracy: ratio(right.length, answered.length),
    goodFormKeys: goodForm.length,
    falseAlarms: goodForm.filter((r) => r.shown === "wrong").length,
    falseAlarmRate: ratio(goodForm.filter((r) => r.shown === "wrong").length, goodForm.length),
    wrongFingerKeys: badForm.length,
    caught: badForm.filter((r) => r.shown === "wrong").length,
    caughtRate: ratio(badForm.filter((r) => r.shown === "wrong").length, badForm.length),
    confusions: [...confusions.entries()].sort((a, b) => b[1] - a[1]),
    byFinger,
    sweep,
    problems: rows.filter((r) => r.problem).map((r) => `key ${r.number}: ${r.problem}`),
    msAverage: times.length ? times.reduce((s, v) => s + v, 0) / times.length : 0,
    msMax: times.length ? Math.max(...times) : 0,
  };
}

const pct = (value) => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);

/** Plain text report. */
export function formatSummary(summary, title) {
  const lines = [`== ${title}`];
  lines.push(`Keys: ${summary.keys} in recording, ${summary.scored} labeled and scored.`);
  lines.push(
    `Answered (confidence >= ${MIN_ATTRIBUTION_CONFIDENCE}): ${summary.answered} of ${summary.scored} (${pct(summary.coverage)}). ` +
      "The rest show \"Finger check unavailable.\"",
  );
  lines.push(`Finger accuracy when answered: ${pct(summary.fingerAccuracy)}`);
  lines.push(
    `False alarms (good form told "wrong finger"): ${summary.falseAlarms} of ${summary.goodFormKeys} answered (${pct(summary.falseAlarmRate)})`,
  );
  lines.push(
    `Wrong fingers caught (told "wrong finger"): ${summary.caught} of ${summary.wrongFingerKeys} answered (${pct(summary.caughtRate)})`,
  );
  if (summary.confusions.length > 0) {
    lines.push("Most common mistakes (really used -> function said):");
    for (const [pair, count] of summary.confusions.slice(0, 8)) lines.push(`  ${count} x ${pair}`);
  }
  lines.push("By the finger really used: keys / answered / right");
  for (const [finger, s] of Object.entries(summary.byFinger)) {
    lines.push(`  ${finger.padEnd(14)} ${String(s.keys).padStart(4)} ${String(s.answered).padStart(4)} ${String(s.right).padStart(4)}`);
  }
  lines.push("If the confidence cutoff were stricter: cutoff / coverage / accuracy");
  for (const s of summary.sweep) lines.push(`  ${s.cutoff.toFixed(1)}  ${pct(s.coverage).padStart(7)}  ${pct(s.accuracy).padStart(7)}`);
  lines.push(`Time per call: ${summary.msAverage.toFixed(2)} ms average, ${summary.msMax.toFixed(2)} ms slowest.`);
  if (summary.problems.length > 0) {
    lines.push(`Problems (${summary.problems.length}):`);
    for (const problem of summary.problems.slice(0, 10)) lines.push(`  ${problem}`);
  }
  return lines.join("\n");
}

/** One line per key, for --verbose. */
export function formatRow(row) {
  const key = row.key === " " ? "Space" : row.key;
  const truth = row.truth ? row.truth.map(fingerLabel).join(" or ") : "(not labeled)";
  const got = row.result ? `${fingerLabel(row.result.finger)} @ ${row.result.confidence.toFixed(2)}` : "null";
  const mark = !row.scored ? " " : !row.answered ? "?" : row.fingerRight ? "ok" : "XX";
  return `${String(row.number).padStart(4)}  ${mark.padEnd(2)}  ${JSON.stringify(key).padEnd(9)} used ${truth.padEnd(16)} got ${got}${row.problem ? `  [${row.problem}]` : ""}`;
}
