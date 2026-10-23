// Tests for the evaluation tools (scripts/lib), using stand-in functions with
// fixed answers. They check the scoring and timing, not any finger logic.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ATTRIBUTION_DELAY_MS } from "../js/config.js";
import { bufferAtCallTime, evaluateRecording, summarize } from "../scripts/lib/evaluate.mjs";
import { formatKeyList, labelsFromTruths, parseKeyList, resolveLabels, validateLabels } from "../scripts/lib/labels.mjs";
import { trimRecording } from "../scripts/make-fixture.mjs";
import { generateSynthetic } from "./synthetic.js";

const KEYS = [
  { code: "KeyF", key: "f", t: 1000 },
  { code: "KeyJ", key: "j", t: 1300 },
  { code: "Space", key: " ", t: 1600 },
  { code: "KeyD", key: "d", t: 1900 },
  { code: "Escape", key: "Escape", t: 2100 },
];

test("parseKeyList reads numbers and ranges and rejects nonsense", () => {
  assert.deepEqual(parseKeyList("1-3, 7"), [1, 2, 3, 7]);
  assert.deepEqual(parseKeyList(""), []);
  assert.deepEqual(parseKeyList(undefined), []);
  assert.throws(() => parseKeyList("0"), /Bad key number/);
  assert.throws(() => parseKeyList("5-2"), /Bad key range/);
  assert.throws(() => parseKeyList("a-b"), /Bad key number/);
});

test("formatKeyList is the reverse of parseKeyList", () => {
  assert.equal(formatKeyList([1, 2, 3, 7, 9, 10]), "1-3, 7, 9-10");
  assert.deepEqual(parseKeyList(formatKeyList([2, 4, 5, 6])), [2, 4, 5, 6]);
  assert.equal(formatKeyList([]), "");
});

test("validateLabels rejects unknown fingers", () => {
  assert.throws(() => validateLabels({ default: "LEFT_INDEX" }), /not "expected"/);
  assert.throws(() => validateLabels({ fingers: [{ keys: "1", finger: "R_TOE" }] }), /item 1/);
  validateLabels({ default: "expected", fingers: [{ keys: "1-2", finger: "R_INDEX" }], skip: "3" });
});

test("resolveLabels: default expected, overrides, skips, Space and unmapped keys", () => {
  const truths = resolveLabels(KEYS, { default: "expected", fingers: [{ keys: "2", finger: "R_MIDDLE" }], skip: "4" });
  assert.deepEqual(truths, [["L_INDEX"], ["R_MIDDLE"], ["L_THUMB", "R_THUMB"], null, null]);
  assert.deepEqual(resolveLabels(KEYS, { default: "unknown", fingers: [{ keys: "1", finger: "L_MIDDLE" }] }), [["L_MIDDLE"], null, null, null, null]);
  assert.throws(() => resolveLabels(KEYS, { skip: "9" }), /only 5 keys/);
});

test("labelsFromTruths round-trips through resolveLabels", () => {
  const truths = [["L_INDEX"], ["R_MIDDLE"], ["L_THUMB", "R_THUMB"], null, null];
  const labels = labelsFromTruths(KEYS, truths, { typist: "test" });
  assert.equal(labels.typist, "test");
  assert.deepEqual(resolveLabels(KEYS, labels), truths);
});

test("bufferAtCallTime holds only frames that would have arrived by the call", () => {
  const { frames } = generateSynthetic({ fps: 50, durationMs: 1500, startTime: 0 }); // a frame every 20 ms
  const keyEvent = { code: "KeyF", key: "f", t: 1000 };
  const noLag = bufferAtCallTime(frames, keyEvent);
  assert.equal(noLag.latest().t, 1000 + ATTRIBUTION_DELAY_MS);
  const lagged = bufferAtCallTime(frames, keyEvent, { arrivalLagMs: 50 });
  assert.ok(lagged.latest().t <= 1000 + ATTRIBUTION_DELAY_MS - 50);
  assert.ok(noLag.between(-Infinity, Infinity)[0].t >= noLag.latest().t - noLag.windowMs);
});

test("evaluateRecording and summarize score fixed answers correctly", () => {
  const { frames } = generateSynthetic({ durationMs: 1500 });
  const recording = { frames, keyEvents: KEYS, meta: { calibration: null } };
  // Really used: F with left index (good form), J with right MIDDLE (wrong finger),
  // Space with a thumb, D skipped, Escape has no finger.
  const truths = resolveLabels(KEYS, { default: "expected", fingers: [{ keys: "2", finger: "R_MIDDLE" }], skip: "4" });
  const answers = {
    KeyF: { finger: "L_INDEX", confidence: 0.9 }, // right
    KeyJ: { finger: "R_INDEX", confidence: 0.8 }, // said the expected finger, but J was pressed with the middle
    Space: { finger: "R_THUMB", confidence: 0.3 }, // too unsure, shown as unavailable
    KeyD: { finger: "L_MIDDLE", confidence: 1 },
    Escape: null,
  };
  const rows = evaluateRecording(recording, truths, (keyEvent) => answers[keyEvent.code], {});
  assert.deepEqual(rows.map((r) => r.scored), [true, true, true, false, false]);
  assert.deepEqual(rows.map((r) => r.shown), ["correct", "correct", "unavailable", "correct", "unavailable"]);
  assert.deepEqual(rows.map((r) => r.deserved), ["correct", "wrong", "correct", null, null]);

  const s = summarize(rows);
  assert.equal(s.scored, 3);
  assert.equal(s.answered, 2);
  assert.equal(s.coverage, 2 / 3);
  assert.equal(s.fingerAccuracy, 0.5);
  assert.equal(s.falseAlarms, 0);
  assert.equal(s.wrongFingerKeys, 1);
  assert.equal(s.caught, 0);
  assert.deepEqual(s.confusions, [["right middle -> right index", 1]]);
  assert.deepEqual(s.sweep.find((x) => x.cutoff === 0.9), { cutoff: 0.9, coverage: 1 / 3, accuracy: 1 });
  assert.deepEqual(s.problems, []);
});

test("evaluateRecording reports a function that throws instead of crashing", () => {
  const recording = { frames: [], keyEvents: KEYS.slice(0, 1), meta: {} };
  const rows = evaluateRecording(recording, [["L_INDEX"]], () => { throw new Error("boom"); });
  assert.match(rows[0].problem, /boom/);
  assert.deepEqual(summarize(rows).problems, ["key 1: attributeKeystroke threw: boom"]);
});

test("trimRecording keeps chosen keys, their frames and their labels", () => {
  const { frames } = generateSynthetic({ durationMs: 6000, startTime: 0, fps: 30 });
  const keyEvents = [1000, 3000, 5000].map((t, i) => ({ code: ["KeyF", "KeyJ", "KeyK"][i], key: "x", t }));
  const recording = { format: "f", version: 1, meta: { calibration: { handSpan: 1 } }, frames, keyEvents };
  const truths = [["L_INDEX"], ["R_RING"], ["R_MIDDLE"]];
  const trimmed = trimRecording(recording, truths, [2], "source.json");
  assert.deepEqual(trimmed.recording.keyEvents.map((k) => k.t), [3000]);
  assert.deepEqual(trimmed.truths, [["R_RING"]]);
  assert.ok(trimmed.recording.frames.every((f) => f.t >= 1000 && f.t <= 3500));
  assert.equal(trimmed.recording.meta.calibration.handSpan, 1);
  const x = trimmed.recording.frames[0].hands[0].landmarks[0].x;
  assert.equal(x, Math.round(x * 1e4) / 1e4);
});
