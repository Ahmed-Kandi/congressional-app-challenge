import { test } from "node:test";
import assert from "node:assert/strict";
import { averageFingertip, computeCalibration, createKeyboardGridCapture } from "../js/calibration.js";
import { KEYBOARD_GRID_WAIT_MS } from "../js/config.js";
import { FINGERS } from "../js/fingerMap.js";
import { FrameBuffer } from "../js/frameBuffer.js";
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

/** Frames where the index finger named for a corner sits on that corner, at time t. */
function framesTouching(code, t) {
  const corner = GRID_CORNERS.find((c) => c.code === code);
  const touch = syntheticCornerTouches()[code];
  const { frames } = generateSynthetic({ noise: 0, durationMs: 100, startTime: t - 50 });
  return frames.map((frame) => ({
    t: frame.t,
    hands: frame.hands.map((hand) => {
      if (!corner.finger.startsWith(hand.side)) return hand;
      const landmarks = hand.landmarks.map((p) => ({ ...p }));
      landmarks[fingertipLocation(corner.finger).index] = { x: touch.x, y: touch.y, z: 0 };
      return { ...hand, landmarks };
    }),
  }));
}

test("the grid step records the named fingertip on Q, P, Z and / and builds the grid", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const elements = fakeGridElements();
  const frameBuffer = new FrameBuffer(100000);
  let grid = null;
  const capture = createKeyboardGridCapture({ elements, frameBuffer, getHomeRow: () => null, onGrid: (g) => { grid = g; } });
  capture.start();

  // A wrong key is ignored with a hint.
  capture.handleKey({ code: "KeyW", key: "w", t: 500 });
  assert.match(elements.status.textContent, /That was w\. Press Q/);

  let time = 1000;
  for (const { code } of GRID_CORNERS) {
    for (const frame of framesTouching(code, time)) frameBuffer.push(frame);
    capture.handleKey({ code, key: code, t: time });
    t.mock.timers.tick(KEYBOARD_GRID_WAIT_MS + 1);
    time += 1000;
  }
  assert.equal(capture.running, false);
  assert.ok(grid, `no grid; status: ${elements.status.textContent}`);
  const truth = syntheticCornerTouches();
  for (const { code } of GRID_CORNERS) {
    const center = keyCenterInImage(grid, code);
    near(center.x, truth[code].x, 1e-9);
    near(center.y, truth[code].y, 1e-9);
  }
});

test("the grid step asks again when the hand was not visible", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const elements = fakeGridElements();
  const capture = createKeyboardGridCapture({ elements, frameBuffer: new FrameBuffer(), getHomeRow: () => null, onGrid: () => {} });
  capture.start();
  capture.handleKey({ code: "KeyQ", key: "q", t: 1000 });
  t.mock.timers.tick(KEYBOARD_GRID_WAIT_MS + 1);
  assert.match(elements.status.textContent, /could not see your left hand.*Press Q again/);
  assert.equal(capture.running, true);
});
