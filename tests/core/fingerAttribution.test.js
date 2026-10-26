// Tests for attributeKeystroke() in js/core/fingerAttribution.js.
// Run them with: npm run test:core
//
// Every test builds synthetic frames (tests/synthetic.js) where we KNOW which
// finger pressed, fills a FrameBuffer the way the app does, and checks the
// answer. Frames are added only up to ATTRIBUTION_DELAY_MS after the key,
// because that is all the app will have when it calls the function.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ATTRIBUTION_IMPLEMENTED, attributeKeystroke } from "../../js/core/fingerAttribution.js";
import { computeCalibration } from "../../js/calibration.js";
import { ATTRIBUTION_DELAY_MS, MIN_ATTRIBUTION_CONFIDENCE } from "../../js/config.js";
import { FINGERS, fingerLabel } from "../../js/fingerMap.js";
import { FrameBuffer } from "../../js/frameBuffer.js";
import { computeKeyboardGrid } from "../../js/keyboardGrid.js";
import { generateSynthetic, syntheticCornerTouches } from "../synthetic.js";

const NON_THUMB_FINGERS = FINGERS.filter((finger) => !finger.endsWith("THUMB"));
const KEY_TIME = 1600;

// Calibration from a still, both-hands rest period, exactly as the app makes it.
const CALIBRATION = computeCalibration(generateSynthetic({ seed: 99, durationMs: 1000 }).frames, "test").calibration;

/** Run the team's function on one synthetic press, the way the app would. */
function attributeScenario(options) {
  const { frames, keyEvents } = generateSynthetic({ durationMs: 1200, ...options });
  const keyEvent = keyEvents[0] ?? { code: "KeyF", key: "f", t: KEY_TIME };
  const buffer = new FrameBuffer();
  for (const frame of frames) {
    if (frame.t <= keyEvent.t + ATTRIBUTION_DELAY_MS) buffer.push(frame);
  }
  return attributeKeystroke(keyEvent, buffer, options.calibration === undefined ? CALIBRATION : options.calibration);
}

function describe(result) {
  if (result === null) return "null (the function returned null, meaning 'unsure')";
  return `${JSON.stringify(result.finger)} (${fingerLabel(result.finger)}) with confidence ${result.confidence}`;
}

function assertPicks(expectedFinger, result, situation) {
  assert.ok(
    result !== null && result.finger === expectedFinger,
    `${situation}: expected ${expectedFinger} (${fingerLabel(expectedFinger)}), got ${describe(result)}`,
  );
}

test("status report: has the team implemented attributeKeystroke yet?", () => {
  assert.equal(
    ATTRIBUTION_IMPLEMENTED,
    true,
    "ATTRIBUTION_IMPLEMENTED is false in js/core/fingerAttribution.js. Set it to true once your function works.",
  );
});

for (const fps of [30, 60]) {
  for (const finger of NON_THUMB_FINGERS) {
    test(`clean press, ${fps} fps: ${finger}`, () => {
      const result = attributeScenario({ fps, seed: 1, presses: [{ finger, t: KEY_TIME }] });
      assertPicks(finger, result, `Clean ${finger} press at ${fps} fps`);
    });
  }
}

// The same clean presses when the calibration also has a keyboard map (Q, P, Z, /).
const CALIBRATION_WITH_GRID = {
  ...CALIBRATION,
  keyboardGrid: computeKeyboardGrid(syntheticCornerTouches(), CALIBRATION, "test").grid,
};
for (const finger of NON_THUMB_FINGERS) {
  test(`clean press with a keyboard map, 30 fps: ${finger}`, () => {
    const result = attributeScenario({ fps: 30, seed: 5, calibration: CALIBRATION_WITH_GRID, presses: [{ finger, t: KEY_TIME }] });
    assertPicks(finger, result, `Clean ${finger} press with a keyboard map in the calibration`);
  });
}

test("a nearby wrong finger is identified instead of assuming the key's expected finger", () => {
  const { frames, keyEvents } = generateSynthetic({
    fps: 30, seed: 8, durationMs: 1200, presses: [{ finger: "L_MIDDLE", t: KEY_TIME }],
  });
  const buffer = new FrameBuffer();
  for (const frame of frames) if (frame.t <= KEY_TIME + ATTRIBUTION_DELAY_MS) buffer.push(frame);
  const result = attributeKeystroke({ ...keyEvents[0], code: "KeyF", key: "f" }, buffer, CALIBRATION_WITH_GRID);
  assertPicks("L_MIDDLE", result, "Left middle used on F, which normally expects left index");
});

for (const finger of NON_THUMB_FINGERS) {
  test(`50 ms of frame lag, 30 fps: ${finger}`, () => {
    const result = attributeScenario({ fps: 30, seed: 2, frameLagMs: 50, presses: [{ finger, t: KEY_TIME }] });
    assertPicks(finger, result, `${finger} press with video 50 ms behind the key event`);
  });
}

test("works without calibration (calibration = null)", () => {
  const result = attributeScenario({ fps: 30, seed: 3, calibration: null, presses: [{ finger: "L_INDEX", t: KEY_TIME }] });
  assertPicks("L_INDEX", result, "L_INDEX press with no calibration");
});

const SIMULTANEOUS_PAIRS = [
  ["L_INDEX", "L_MIDDLE"],
  ["R_MIDDLE", "R_RING"],
  ["L_RING", "R_INDEX"],
  ["R_PINKY", "R_RING"],
];
for (const [presser, other] of SIMULTANEOUS_PAIRS) {
  test(`second finger moving at the same time, larger motion wins: ${presser} (full) vs ${other} (40%)`, () => {
    const result = attributeScenario({
      fps: 30,
      seed: 4,
      presses: [{ finger: presser, t: KEY_TIME }],
      silentPresses: [{ finger: other, t: KEY_TIME, amplitude: 0.4 }],
    });
    assertPicks(presser, result, `${presser} pressed while ${other} moved less`);
  });
}

function assertUnsure(result, situation) {
  assert.ok(
    result === null || result.confidence < MIN_ATTRIBUTION_CONFIDENCE,
    `${situation}: expected null or confidence below ${MIN_ATTRIBUTION_CONFIDENCE}, got ${describe(result)}`,
  );
}

test("no hands visible: returns null or low confidence", () => {
  const result = attributeScenario({ missingHands: ["L", "R"], presses: [{ finger: "L_INDEX", t: KEY_TIME }] });
  assertUnsure(result, "No hands in any frame");
});

test("the pressing hand is missing: returns null or low confidence", () => {
  const result = attributeScenario({ missingHands: ["L"], presses: [{ finger: "L_MIDDLE", t: KEY_TIME }] });
  assertUnsure(result, "Left hand missing during a left-hand press");
});

test("empty frame buffer: returns null or low confidence", () => {
  const result = attributeKeystroke({ code: "KeyF", key: "f", t: KEY_TIME }, new FrameBuffer(), CALIBRATION);
  assertUnsure(result, "No frames at all");
});

test("still hands do not produce a confident finger check from tracking noise", () => {
  const { frames } = generateSynthetic({ fps: 30, noise: 0.004, seed: 71, durationMs: 1200 });
  const buffer = new FrameBuffer();
  for (const frame of frames) buffer.push(frame);
  assertUnsure(attributeKeystroke({ code: "KeyF", key: "f", t: KEY_TIME }, buffer, CALIBRATION_WITH_GRID), "No press");
});

test("never returns a finger ID that is not in the map, and confidence stays in 0..1", () => {
  const problems = [];
  let seed = 10;
  for (const fps of [30, 60]) {
    for (const finger of FINGERS) {
      for (const missingHands of [[], ["L"], ["R"]]) {
        seed += 1;
        const result = attributeScenario({ fps, seed, missingHands, noise: 0.004, presses: [{ finger, t: KEY_TIME }] });
        if (result === null) continue;
        if (!FINGERS.includes(result.finger)) problems.push(`finger ${JSON.stringify(result.finger)}`);
        if (!(result.confidence >= 0 && result.confidence <= 1)) problems.push(`confidence ${result.confidence}`);
      }
    }
  }
  assert.deepEqual(problems, [], "attributeKeystroke returned invalid values");
});

test("does not change the frames it is given", () => {
  const { frames, keyEvents } = generateSynthetic({ presses: [{ finger: "R_INDEX", t: KEY_TIME }] });
  const buffer = new FrameBuffer();
  for (const frame of frames) buffer.push(frame);
  const before = JSON.stringify(buffer.between(-Infinity, Infinity));
  attributeKeystroke(keyEvents[0], buffer, CALIBRATION);
  assert.equal(JSON.stringify(buffer.between(-Infinity, Infinity)), before, "frames were modified");
});
