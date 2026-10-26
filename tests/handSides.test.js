import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assignSides,
  calibrationMatchesSides,
  handCenterX,
  sideSettingsOf,
  userLeftIsOnImageLeft,
} from "../js/handSides.js";

// Averages of floats are not exact, so compare positions with a tolerance.
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

// A fake detection whose 21 landmarks all sit at horizontal position x.
const handAt = (x, score = 0.9) => ({
  landmarks: Array.from({ length: 21 }, () => ({ x, y: 0.5, z: 0 })),
  score,
});

const FACINGS = ["above", "behind"];
const MIRRORED = [false, true];

// Expected answer, written out by hand for every combination of settings.
const LEFT_HAND_ON_IMAGE_LEFT = {
  "above/false": true, // looking down like the user: left is left
  "above/true": false, // mirrored: swapped
  "behind/false": false, // facing the user: their left is on our right
  "behind/true": true, // facing the user and mirrored: swapped back
};

test("handCenterX averages landmark x", () => {
  const hand = { landmarks: [{ x: 0.2 }, { x: 0.4 }] };
  near(handCenterX(hand.landmarks), 0.3);
});

for (const cameraFacing of FACINGS) {
  for (const mirrored of MIRRORED) {
    const settings = { cameraFacing, mirrored };
    const label = `facing=${cameraFacing} mirrored=${mirrored}`;
    const leftOnImageLeft = LEFT_HAND_ON_IMAGE_LEFT[`${cameraFacing}/${mirrored}`];

    test(`${label}: orientation rule`, () => {
      assert.equal(userLeftIsOnImageLeft(settings), leftOnImageLeft);
    });

    test(`${label}: two hands get one L and one R on the correct sides`, () => {
      const imageLeft = handAt(0.25);
      const imageRight = handAt(0.75);
      // Feed them in both orders: the result must not depend on detection order.
      for (const detections of [[imageLeft, imageRight], [imageRight, imageLeft]]) {
        const hands = assignSides(detections, settings);
        assert.deepEqual(hands.map((h) => h.side), ["L", "R"]);
        const leftHandX = handCenterX(hands[0].landmarks);
        near(leftHandX, leftOnImageLeft ? 0.25 : 0.75);
      }
    });

    test(`${label}: one hand in the image's left half`, () => {
      const [hand] = assignSides([handAt(0.2)], settings);
      assert.equal(hand.side, leftOnImageLeft ? "L" : "R");
    });

    test(`${label}: one hand in the image's right half`, () => {
      const [hand] = assignSides([handAt(0.8)], settings);
      assert.equal(hand.side, leftOnImageLeft ? "R" : "L");
    });

    test(`${label}: two hands both in the same half still get L and R`, () => {
      const hands = assignSides([handAt(0.6), handAt(0.9)], settings);
      assert.deepEqual(hands.map((h) => h.side), ["L", "R"]);
      near(handCenterX(hands[0].landmarks), leftOnImageLeft ? 0.6 : 0.9);
    });

    test(`${label}: no hands gives an empty list`, () => {
      assert.deepEqual(assignSides([], settings), []);
    });
  }
}

test("output keeps landmarks and score and drops extra fields", () => {
  const [hand] = assignSides([handAt(0.3, 0.77)], { cameraFacing: "above", mirrored: false });
  assert.deepEqual(Object.keys(hand).sort(), ["landmarks", "score", "side"]);
  assert.equal(hand.score, 0.77);
  assert.equal(hand.landmarks.length, 21);
});

test("more than two detections: only the first two are used", () => {
  const hands = assignSides([handAt(0.1), handAt(0.9), handAt(0.5)], { cameraFacing: "above", mirrored: false });
  assert.equal(hands.length, 2);
});

test("a camera rotated 180 degrees swaps which image side is the left hand", () => {
  for (const cameraFacing of FACINGS) {
    for (const mirrored of MIRRORED) {
      const upright = userLeftIsOnImageLeft({ mirrored, cameraFacing, rotated: false });
      assert.equal(userLeftIsOnImageLeft({ mirrored, cameraFacing, rotated: true }), !upright);
    }
  }
});

test("sideSettingsOf keeps only the settings that decide left and right", () => {
  assert.deepEqual(sideSettingsOf({ mirrored: true, cameraFacing: "behind", rotated: true, flipView: true }), {
    mirrored: true,
    cameraFacing: "behind",
    rotated: true,
  });
  // Settings saved before "rotated" existed count as not rotated.
  assert.deepEqual(sideSettingsOf({ mirrored: false, cameraFacing: "above" }), { mirrored: false, cameraFacing: "above", rotated: false });
});

test("a calibration only matches the left/right settings it was measured with", () => {
  const settings = { mirrored: false, cameraFacing: "above", rotated: false, flipView: true };
  const calibration = { sides: sideSettingsOf(settings) };
  assert.equal(calibrationMatchesSides(calibration, settings), true);
  // The display-only flip does not change left and right.
  assert.equal(calibrationMatchesSides(calibration, { ...settings, flipView: false }), true);
  assert.equal(calibrationMatchesSides(calibration, { ...settings, rotated: true }), false);
  assert.equal(calibrationMatchesSides(calibration, { ...settings, mirrored: true }), false);
  assert.equal(calibrationMatchesSides(calibration, { ...settings, cameraFacing: "behind" }), false);
  // Older calibrations (no sides recorded) and no calibration are not rejected.
  assert.equal(calibrationMatchesSides({ baselines: {} }, { ...settings, rotated: true }), true);
  assert.equal(calibrationMatchesSides(null, settings), true);
});
