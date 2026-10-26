import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCalibration } from "../js/calibration.js";
import { MAPPED_CODES } from "../js/fingerMap.js";
import {
  GRID_CORNERS,
  KEY_LAYOUT,
  applyHomography,
  computeKeyboardGrid,
  fitHomography,
  hoveredKey,
  imageToKeyboard,
  invertHomography,
  keyCenterInImage,
  keyDistance,
  keyLabel,
  keyWidthInImage,
  keyboardToImage,
  solveLinearSystem,
} from "../js/keyboardGrid.js";
import {
  SYNTHETIC_KEY_PITCH,
  generateSynthetic,
  syntheticCornerTouches,
  syntheticKeyboardPoint,
} from "./synthetic.js";

const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const nearPoint = (p, q, tolerance = 1e-6) => {
  near(p.x, q.x, tolerance);
  near(p.y, q.y, tolerance);
};

const HOME_ROW = computeCalibration(generateSynthetic({ seed: 5, durationMs: 1000, noise: 0 }).frames, "test").calibration;

// A camera tilted toward the keyboard: a real perspective mapping, not just a scale.
const TILTED = [0.05, 0.004, 0.1, 0.002, 0.04, 0.2, 0.01, 0.12, 1];
const tiltedTouches = () =>
  Object.fromEntries(GRID_CORNERS.map(({ code }) => [code, applyHomography(TILTED, { x: KEY_LAYOUT[code].col, y: KEY_LAYOUT[code].row })]));

test("solveLinearSystem solves a small system and refuses a singular one", () => {
  const x = solveLinearSystem([[2, 1], [1, 3]], [5, 10]);
  near(x[0], 1);
  near(x[1], 3);
  assert.equal(solveLinearSystem([[1, 2], [2, 4]], [3, 6]), null);
});

test("fitHomography recovers a known perspective mapping from 4 points", () => {
  const source = [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 2 }, { x: 0, y: 2 }];
  const destination = source.map((p) => applyHomography(TILTED, p));
  const h = fitHomography(source, destination);
  for (let i = 0; i < 9; i += 1) near(h[i], TILTED[i], 1e-9);
});

test("invertHomography undoes the mapping", () => {
  const inverse = invertHomography(TILTED);
  for (const p of [{ x: 0, y: 0 }, { x: 5.5, y: 1.2 }, { x: 13, y: 4 }]) {
    nearPoint(applyHomography(inverse, applyHomography(TILTED, p)), p, 1e-9);
  }
});

test("every key with an expected finger has a position in the layout", () => {
  for (const code of MAPPED_CODES) assert.ok(KEY_LAYOUT[code], `${code} missing from KEY_LAYOUT`);
});

test("home row keys sit on one row, one key apart", () => {
  const homeRow = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon"];
  homeRow.forEach((code, i) => {
    assert.equal(KEY_LAYOUT[code].row, 2);
    near(KEY_LAYOUT[code].col, KEY_LAYOUT.KeyA.col + i);
  });
  // Standard stagger: A is a quarter key right of Q, Z half a key right of A.
  near(KEY_LAYOUT.KeyA.col - KEY_LAYOUT.KeyQ.col, 0.25);
  near(KEY_LAYOUT.KeyZ.col - KEY_LAYOUT.KeyA.col, 0.5);
});

test("synthetic corners give a grid that puts every key where the synthetic keyboard has it", () => {
  const outcome = computeKeyboardGrid(syntheticCornerTouches(), HOME_ROW, "test");
  assert.equal(outcome.ok, true, outcome.reason);
  for (const [code, key] of Object.entries(KEY_LAYOUT)) {
    nearPoint(keyCenterInImage(outcome.grid, code), syntheticKeyboardPoint(key.col, key.row));
  }
  near(keyWidthInImage(outcome.grid, "KeyF"), SYNTHETIC_KEY_PITCH);
});

test("the grid's home row check is small when the fingers rested on the home row", () => {
  const { grid } = computeKeyboardGrid(syntheticCornerTouches(), HOME_ROW, "test");
  // The synthetic fingertips curve up to 0.015 (a quarter key) off a straight row.
  assert.ok(grid.homeRowErrorKeys < 0.3, `homeRowErrorKeys = ${grid.homeRowErrorKeys}`);
});

test("a tilted camera's grid matches the true perspective at every key", () => {
  const outcome = computeKeyboardGrid(tiltedTouches(), null, "test");
  assert.equal(outcome.ok, true, outcome.reason);
  assert.equal(outcome.grid.homeRowErrorKeys, null);
  for (const [code, key] of Object.entries(KEY_LAYOUT)) {
    nearPoint(keyCenterInImage(outcome.grid, code), applyHomography(TILTED, { x: key.col, y: key.row }));
  }
});

test("keyDistance and imageToKeyboard measure in key widths", () => {
  const { grid } = computeKeyboardGrid(syntheticCornerTouches(), null, "test");
  const j = KEY_LAYOUT.KeyJ;
  near(keyDistance(grid, keyCenterInImage(grid, "KeyJ"), "KeyJ"), 0);
  near(keyDistance(grid, keyboardToImage(grid, j.col + 1, j.row), "KeyJ"), 1);
  near(keyDistance(grid, keyboardToImage(grid, j.col, j.row - 1), "KeyJ"), 1);
  const back = imageToKeyboard(grid, keyCenterInImage(grid, "KeyM"));
  near(back.col, KEY_LAYOUT.KeyM.col);
  near(back.row, KEY_LAYOUT.KeyM.row);
  assert.equal(keyDistance(grid, { x: 0.5, y: 0.5 }, "F13"), null);
  assert.equal(keyCenterInImage(grid, "F13"), null);
});

test("a mapped fingertip shows the key beneath it and clears outside the keyboard", () => {
  const { grid } = computeKeyboardGrid(syntheticCornerTouches(), null, "test");
  for (const code of ["KeyF", "KeyJ", "KeyQ", "Slash", "Space"]) {
    assert.equal(hoveredKey(grid, keyCenterInImage(grid, code))?.code, code);
  }
  assert.equal(hoveredKey(grid, keyboardToImage(grid, 16, 2)), null);
  assert.equal(hoveredKey(grid, keyboardToImage(grid, 4, -2)), null);
  assert.equal(hoveredKey(null, { x: 0.5, y: 0.5 }), null);
});

test("computeKeyboardGrid refuses a missing corner", () => {
  const touches = syntheticCornerTouches();
  delete touches.KeyZ;
  const outcome = computeKeyboardGrid(touches, null, "test");
  assert.equal(outcome.ok, false);
  assert.match(outcome.reason, /Missing Z/);
});

test("computeKeyboardGrid refuses corners that cross over (P and / swapped)", () => {
  const touches = syntheticCornerTouches();
  [touches.KeyP, touches.Slash] = [touches.Slash, touches.KeyP];
  assert.equal(computeKeyboardGrid(touches, null, "test").ok, false);
});

test("computeKeyboardGrid refuses corners squeezed into a tiny area", () => {
  const touches = Object.fromEntries(
    Object.entries(syntheticCornerTouches()).map(([code, p]) => [code, { x: 0.5 + (p.x - 0.5) * 0.05, y: 0.5 + (p.y - 0.5) * 0.05 }]),
  );
  assert.equal(computeKeyboardGrid(touches, null, "test").ok, false);
});

test("computeKeyboardGrid warns about a home row mismatch without discarding a visible map", () => {
  const touches = Object.fromEntries(
    Object.entries(syntheticCornerTouches()).map(([code, p]) => [code, { x: p.x + 2 * SYNTHETIC_KEY_PITCH, y: p.y }]),
  );
  const outcome = computeKeyboardGrid(touches, HOME_ROW, "test");
  assert.equal(outcome.ok, true);
  assert.match(outcome.grid.homeRowWarning, /keys away/);
  assert.ok(outcome.grid.homeRowErrorKeys > 1);
});

test("keyLabel turns codes into the character on the key", () => {
  assert.equal(keyLabel("KeyQ"), "Q");
  assert.equal(keyLabel("Digit7"), "7");
  assert.equal(keyLabel("Semicolon"), ";");
  assert.equal(keyLabel("Slash"), "/");
  assert.equal(keyLabel("Enter"), "Enter");
});
