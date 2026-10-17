import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCalibration } from "../js/calibration.js";
import { FINGERS } from "../js/fingerMap.js";
import { INDEX_TIP, PINKY_TIP, WRIST, fingertipLocation } from "../js/landmarks.js";
import { generateSynthetic, restingHand } from "./synthetic.js";

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
