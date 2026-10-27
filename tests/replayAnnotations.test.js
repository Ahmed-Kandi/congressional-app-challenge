import { test } from "node:test";
import assert from "node:assert/strict";
import { captureFingerMarks, compactReplayFrame, displayReplayPoint, drawReplayMarks, followingFingerMarks } from "../js/replayAnnotations.js";

test("replay annotations use the nearest tracked frame and both named fingertips", () => {
  const left = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  const right = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  left[8] = { x: 0.25, y: 0.4 }; // left index, used
  right[8] = { x: 0.8, y: 0.45 }; // right index, expected
  const frames = {
    between: () => [
      { t: 950, hands: [] },
      { t: 1003, hands: [{ side: "L", landmarks: left }, { side: "R", landmarks: right }] },
    ],
  };
  assert.deepEqual(captureFingerMarks(frames, 1000, "L_INDEX", ["R_INDEX"]), {
    used: { x: 0.25, y: 0.4 },
    expected: [{ x: 0.8, y: 0.45 }],
  });
});

test("replay marks follow interpolated fingertip positions as the video advances", () => {
  const frame = (t, usedX, expectedX) => {
    const left = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
    const right = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
    left[8] = { x: usedX, y: 0.4 };
    right[8] = { x: expectedX, y: 0.5 };
    return compactReplayFrame({ t, hands: [{ side: "L", landmarks: left }, { side: "R", landmarks: right }] });
  };
  const frames = [frame(1000, 0.1, 0.8), frame(1040, 0.3, 0.6)];
  assert.deepEqual(followingFingerMarks(frames, 1000, "L_INDEX", ["R_INDEX"]), {
    used: { x: 0.1, y: 0.4 }, expected: [{ x: 0.8, y: 0.5 }],
  });
  const halfway = followingFingerMarks(frames, 1020, "L_INDEX", ["R_INDEX"]);
  assert.ok(Math.abs(halfway.used.x - 0.2) < 1e-9);
  assert.ok(Math.abs(halfway.expected[0].x - 0.7) < 1e-9);
  assert.deepEqual(followingFingerMarks(frames, 1040, "L_INDEX", ["R_INDEX"]), {
    used: { x: 0.3, y: 0.4 }, expected: [{ x: 0.6, y: 0.5 }],
  });
  assert.equal(followingFingerMarks(frames, 1300, "L_INDEX", ["R_INDEX"]), null);
});

test("replay turns finger coordinates and draws status marks without labels", () => {
  const turned = displayReplayPoint({ x: 0.2, y: 0.3 }, 640, 360, true, false);
  const straight = displayReplayPoint({ x: 0.2, y: 0.3 }, 640, 360, true, true);
  assert.deepEqual([turned.x, Math.round(turned.y)], [512, 252]);
  assert.deepEqual([straight.x, Math.round(straight.y)], [128, 108]);

  const circles = [];
  const words = [];
  const ctx = {
    clearRect() {}, beginPath() {}, arc: (x, y, radius) => circles.push({ x, y, radius }),
    setLineDash() {}, stroke() {}, fillRect() {}, strokeRect() {},
    fillText: (word) => words.push(word),
  };
  const canvas = { width: 640, height: 360, getContext: () => ctx };
  drawReplayMarks(canvas, { used: { x: 0.2, y: 0.4 }, expected: [{ x: 0.8, y: 0.4 }] },
    { rotated: true });
  assert.deepEqual(circles.map(({ x, y, radius }) => [Math.round(x), Math.round(y), radius]),
    [[128, 216, 20], [512, 216, 20]]);
  assert.ok(words.includes("✓"));
  assert.ok(words.includes("✗"));
});
