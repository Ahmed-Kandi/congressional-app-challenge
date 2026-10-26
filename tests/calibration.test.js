import { test } from "node:test";
import assert from "node:assert/strict";
import { averageFingertip, computeCalibration, createKeyboardGridCapture, pointInVideoFrame } from "../js/calibration.js";
import { FINGERS } from "../js/fingerMap.js";
import { GRID_CORNERS, keyCenterInImage } from "../js/keyboardGrid.js";
import { INDEX_TIP, PINKY_TIP, WRIST, fingertipLocation } from "../js/landmarks.js";
import { generateSynthetic, restingHand, syntheticCornerTouches } from "./synthetic.js";

const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test("noise-free rest frames give exactly the resting positions", () => {
  const { frames } = generateSynthetic({ noise: 0, durationMs: 3000 });
  const outcome = computeCalibration(frames, "2026-10-19T00:00:00.000Z");
  assert.equal(outcome.ok, true);
  const { calibration } = outcome;
  assert.equal(calibration.createdAt, "2026-10-19T00:00:00.000Z");
  assert.deepEqual(Object.keys(calibration.baselines).sort(), [...FINGERS].sort());
  for (const finger of FINGERS) {
    const { side, index } = fingertipLocation(finger);
    const expected = restingHand(side)[index];
    for (const axis of ["x", "y", "z"]) near(calibration.baselines[finger][axis], expected[axis]);
  }
  for (const side of ["L", "R"]) {
    for (const axis of ["x", "y", "z"]) near(calibration.wristBaselines[side][axis], restingHand(side)[WRIST][axis]);
  }
  const span = (side) => {
    const hand = restingHand(side);
    return Math.hypot(hand[INDEX_TIP].x - hand[PINKY_TIP].x, hand[INDEX_TIP].y - hand[PINKY_TIP].y);
  };
  near(calibration.handSpan, (span("L") + span("R")) / 2);
});

test("averaging removes most of the noise", () => {
  const { frames } = generateSynthetic({ noise: 0.003, durationMs: 3000 });
  const { calibration } = computeCalibration(frames);
  near(calibration.baselines.L_INDEX.x, restingHand("L")[INDEX_TIP].x, 0.001);
});

test("fails when both hands are visible in fewer than 80% of frames", () => {
  const both = generateSynthetic({ durationMs: 1000 }).frames.slice(0, 7);
  const leftOnly = generateSynthetic({ durationMs: 1000, missingHands: ["R"] }).frames.slice(0, 3);
  const outcome = computeCalibration([...both, ...leftOnly]); // 7 of 10 = 70%
  assert.equal(outcome.ok, false);
  near(outcome.bothHandsRatio, 0.7);
  assert.match(outcome.reason, /70%/);
});

test("passes at exactly 80% both-hand frames", () => {
  const both = generateSynthetic({ durationMs: 1000 }).frames.slice(0, 8);
  const none = generateSynthetic({ durationMs: 1000, missingHands: ["L", "R"] }).frames.slice(0, 2);
  assert.equal(computeCalibration([...both, ...none]).ok, true);
});

test("no frames at all fails cleanly", () => {
  const outcome = computeCalibration([]);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.bothHandsRatio, 0);
});

// ---- Keyboard grid step ----

test("averageFingertip averages one finger and skips frames without that hand", () => {
  const { frames } = generateSynthetic({ noise: 0, durationMs: 200 });
  const withGap = [...frames, { t: 9999, hands: frames[0].hands.filter((h) => h.side === "R") }];
  const left = averageFingertip(withGap, "L_INDEX");
  assert.equal(left.samples, frames.length);
  for (const axis of ["x", "y", "z"]) near(left.point[axis], restingHand("L")[fingertipLocation("L_INDEX").index][axis]);
  assert.equal(averageFingertip([{ t: 0, hands: [] }], "R_INDEX"), null);
});

test("a click on a contained video maps to its image and ignores letterboxing", () => {
  const rect = { left: 100, top: 200, width: 800, height: 600 };
  // A 16:9 video fills the width and leaves 75 pixels above and below.
  assert.deepEqual(pointInVideoFrame(500, 500, rect, 1280, 720), { x: 0.5, y: 0.5 });
  assert.equal(pointInVideoFrame(500, 220, rect, 1280, 720), null);
  assert.equal(pointInVideoFrame(500, 500, rect, 0, 0), null);
});

/** Just enough of the DOM for the grid step to render into. */
function fakeGridElements() {
  globalThis.document ??= { createElement: () => ({ textContent: "" }) };
  const textHolder = () => ({ textContent: "", replaceChildren() {}, append() {} });
  const step = () => {
    const mark = { textContent: "" };
    return { mark, classList: { toggle() {} }, querySelector: () => mark };
  };
  return { prompt: textHolder(), status: textHolder(), steps: GRID_CORNERS.map(step) };
}

test("clicking the four visible key centers builds a map without hand tracking", () => {
  const elements = fakeGridElements();
  const touches = syntheticCornerTouches();
  const progress = [];
  let grid = null;
  const capture = createKeyboardGridCapture({
    elements,
    getHomeRow: () => null,
    onProgress: (placed) => progress.push(placed ? Object.keys(placed).length : 0),
    onGrid: (value) => { grid = value; },
  });
  capture.start();
  for (const { code } of GRID_CORNERS) capture.handlePoint(code, touches[code]);
  assert.equal(capture.running, true);
  assert.ok(grid, elements.status.textContent);
  assert.deepEqual(progress, [0, 1, 2, 3, 4]);
  for (const { code } of GRID_CORNERS) {
    const center = keyCenterInImage(grid, code);
    near(center.x, touches[code].x);
    near(center.y, touches[code].y);
  }
  capture.stop();
  assert.equal(capture.running, false);
  assert.deepEqual(progress, [0, 1, 2, 3, 4, 0]);
});
