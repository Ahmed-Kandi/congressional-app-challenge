// Tests that the synthetic data generator itself behaves.
// These check the generator against what it was TOLD to do (which finger,
// when, how far). None of them work out a finger from the data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, HOME_KEY_FOR_FINGER, generateSynthetic, pressDepth, restingHand } from "./synthetic.js";
import { FINGERS } from "../js/fingerMap.js";
import { FINGERTIP_BY_FINGER_NAME, LANDMARK_COUNT } from "../js/landmarks.js";

const tipOf = (frame, finger) => {
  const [side, name] = finger.split("_");
  return frame.hands.find((h) => h.side === side).landmarks[FINGERTIP_BY_FINGER_NAME[name]];
};
const frameNearest = (frames, t) =>
  frames.reduce((best, f) => (Math.abs(f.t - t) < Math.abs(best.t - t) ? f : best));
const moved = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const FULL_PRESS = Math.hypot(DEFAULTS.pressVector.x, DEFAULTS.pressVector.y, DEFAULTS.pressVector.z);

test("frame format matches the app: t, hands with side, 21 landmarks, score", () => {
  const { frames } = generateSynthetic();
  for (const frame of frames) {
    assert.equal(typeof frame.t, "number");
    assert.deepEqual(frame.hands.map((h) => h.side), ["L", "R"]);
    for (const hand of frame.hands) {
      assert.equal(hand.landmarks.length, LANDMARK_COUNT);
      assert.equal(typeof hand.score, "number");
      for (const p of hand.landmarks) for (const axis of ["x", "y", "z"]) assert.ok(Number.isFinite(p[axis]));
    }
  }
});

test("frame rate and timestamps: 30 fps and 60 fps", () => {
  for (const fps of [30, 60]) {
    const { frames } = generateSynthetic({ fps, durationMs: 1000 });
    assert.equal(frames.length, fps + 1, `${fps} fps over 1 s, both ends included`);
    for (let i = 1; i < frames.length; i += 1) {
      assert.ok(Math.abs(frames[i].t - frames[i - 1].t - 1000 / fps) < 1e-9);
    }
  }
});

test("same seed gives the same frames; different seed differs", () => {
  const a = generateSynthetic({ seed: 7 });
  const b = generateSynthetic({ seed: 7 });
  const c = generateSynthetic({ seed: 8 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.frames, c.frames);
});

test("noise has roughly the requested size", () => {
  const { frames } = generateSynthetic({ noise: 0.004, durationMs: 2000 });
  const rest = restingHand("L");
  const deviations = frames.flatMap((f) => f.hands[0].landmarks.map((p, i) => p.x - rest[i].x));
  const sd = Math.sqrt(deviations.reduce((s, d) => s + d * d, 0) / deviations.length);
  assert.ok(sd > 0.0035 && sd < 0.0045, `measured sd ${sd}`);
});

test("pressDepth: 0 at rest, 1 at the key time, rises over 80 ms and falls over 120 ms", () => {
  assert.equal(pressDepth(900, 1000, 80, 120), 0);
  assert.equal(pressDepth(1000, 1000, 80, 120), 1);
  assert.equal(pressDepth(920, 1000, 80, 120), 0);
  assert.equal(pressDepth(1120, 1000, 80, 120), 0);
  assert.ok(pressDepth(960, 1000, 80, 120) > 0 && pressDepth(960, 1000, 80, 120) < 1);
  assert.ok(pressDepth(1060, 1000, 80, 120) > 0 && pressDepth(1060, 1000, 80, 120) < 1);
});

test("the told finger moves by the press vector at key time; it rests far from the press", () => {
  for (const finger of FINGERS) {
    const { frames } = generateSynthetic({ noise: 0, fps: 60, presses: [{ finger, t: 1500 }] });
    const atKey = frameNearest(frames, 1500);
    const atRest = frames[0];
    // With 60 fps the frame nearest 1500 ms is within 8.4 ms of the bottom of the press.
    assert.ok(moved(tipOf(atKey, finger), tipOf(atRest, finger)) > 0.9 * FULL_PRESS, finger);
    assert.ok(moved(tipOf(frameNearest(frames, 1300), finger), tipOf(atRest, finger)) < 1e-12, finger);
  }
});

test("a press does not move a different finger that was not told to move", () => {
  const { frames } = generateSynthetic({ noise: 0, presses: [{ finger: "L_INDEX", t: 1500 }] });
  const atKey = frameNearest(frames, 1500);
  assert.equal(moved(tipOf(atKey, "L_MIDDLE"), tipOf(frames[0], "L_MIDDLE")), 0);
  assert.equal(moved(tipOf(atKey, "R_INDEX"), tipOf(frames[0], "R_INDEX")), 0);
});

test("key events use the finger's home row key and the press time", () => {
  const { keyEvents } = generateSynthetic({ presses: [{ finger: "R_PINKY", t: 1400 }, { finger: "L_RING", t: 1200 }] });
  assert.deepEqual(keyEvents, [
    { code: "KeyS", key: "s", t: 1200 },
    { code: "Semicolon", key: ";", t: 1400 },
  ]);
  assert.deepEqual(HOME_KEY_FOR_FINGER.L_THUMB, { code: "Space", key: " " });
});

test("frame lag shifts the visible press later by the lag", () => {
  const lag = 50;
  const { frames } = generateSynthetic({ noise: 0, fps: 60, frameLagMs: lag, presses: [{ finger: "L_INDEX", t: 1500 }] });
  const rest = tipOf(frames[0], "L_INDEX");
  // At the key time the lagging video still shows the finger only part way down...
  assert.ok(moved(tipOf(frameNearest(frames, 1500), "L_INDEX"), rest) < 0.5 * FULL_PRESS);
  // ...and the bottom of the press appears lag ms later.
  assert.ok(moved(tipOf(frameNearest(frames, 1500 + lag), "L_INDEX"), rest) > 0.9 * FULL_PRESS);
});

test("missingHands removes that hand from every frame", () => {
  const { frames } = generateSynthetic({ missingHands: ["L"] });
  for (const frame of frames) assert.deepEqual(frame.hands.map((h) => h.side), ["R"]);
  const none = generateSynthetic({ missingHands: ["L", "R"] });
  for (const frame of none.frames) assert.deepEqual(frame.hands, []);
});

test("silent presses move a second finger without adding a key event", () => {
  const { frames, keyEvents } = generateSynthetic({
    noise: 0,
    fps: 60,
    presses: [{ finger: "L_INDEX", t: 1500 }],
    silentPresses: [{ finger: "L_MIDDLE", t: 1500, amplitude: 0.4 }],
  });
  assert.equal(keyEvents.length, 1);
  const atKey = frameNearest(frames, 1500);
  const middleMove = moved(tipOf(atKey, "L_MIDDLE"), tipOf(frames[0], "L_MIDDLE"));
  assert.ok(middleMove > 0.35 * FULL_PRESS && middleMove < 0.45 * FULL_PRESS, `${middleMove}`);
});
