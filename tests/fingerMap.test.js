import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FINGERS,
  MAPPED_CODES,
  codeForChar,
  describeFingers,
  expectedFingers,
  expectedFingersForChar,
  needsShift,
} from "../js/fingerMap.js";

// The standard touch-typing table, copied here independently so a typo in
// fingerMap.js cannot hide by being "tested against itself".
const REFERENCE_TABLE = {
  L_PINKY: "Backquote Digit1 KeyQ KeyA KeyZ Tab CapsLock ShiftLeft",
  L_RING: "Digit2 KeyW KeyS KeyX",
  L_MIDDLE: "Digit3 KeyE KeyD KeyC",
  L_INDEX: "Digit4 Digit5 KeyR KeyT KeyF KeyG KeyV KeyB",
  R_INDEX: "Digit6 Digit7 KeyY KeyU KeyH KeyJ KeyN KeyM",
  R_MIDDLE: "Digit8 KeyI KeyK Comma",
  R_RING: "Digit9 KeyO KeyL Period",
  R_PINKY: "Digit0 Minus Equal KeyP BracketLeft BracketRight Backslash Semicolon Quote Slash Enter Backspace ShiftRight",
};

for (const [finger, codes] of Object.entries(REFERENCE_TABLE)) {
  for (const code of codes.split(" ")) {
    test(`${code} -> ${finger}`, () => {
      assert.deepEqual(expectedFingers(code), [finger]);
    });
  }
}

test("Space accepts either thumb", () => {
  assert.deepEqual(expectedFingers("Space").sort(), ["L_THUMB", "R_THUMB"]);
});

test("unknown keys return an empty array", () => {
  for (const code of ["F13", "ArrowLeft", "Escape", "", "NotAKey", "MetaLeft"]) {
    assert.deepEqual(expectedFingers(code), [], code);
  }
});

test("Digit6 belongs to the right index finger (charts disagree; this is our choice)", () => {
  assert.deepEqual(expectedFingers("Digit6"), ["R_INDEX"]);
});

test("the map has exactly the codes in the table plus Space", () => {
  const referenceCodes = Object.values(REFERENCE_TABLE).flatMap((codes) => codes.split(" "));
  assert.deepEqual([...MAPPED_CODES].sort(), [...referenceCodes, "Space"].sort());
});

test("every mapped finger is a known finger ID", () => {
  for (const code of MAPPED_CODES) {
    for (const finger of expectedFingers(code)) assert.ok(FINGERS.includes(finger), `${code} -> ${finger}`);
  }
});

test("returns a copy, so callers cannot change the map", () => {
  expectedFingers("KeyF").push("R_PINKY");
  assert.deepEqual(expectedFingers("KeyF"), ["L_INDEX"]);
});

test("there are exactly 10 finger IDs", () => {
  assert.equal(FINGERS.length, 10);
  assert.equal(new Set(FINGERS).size, 10);
});

test("characters map to physical keys", () => {
  assert.equal(codeForChar("a"), "KeyA");
  assert.equal(codeForChar("A"), "KeyA");
  assert.equal(codeForChar(" "), "Space");
  assert.equal(codeForChar(";"), "Semicolon");
  assert.equal(codeForChar("?"), "Slash");
  assert.equal(codeForChar("7"), "Digit7");
  assert.equal(codeForChar("é"), null);
});

test("shift detection", () => {
  assert.equal(needsShift("T"), true);
  assert.equal(needsShift("t"), false);
  assert.equal(needsShift("?"), true);
  assert.equal(needsShift("."), false);
});

test("expected fingers for characters", () => {
  assert.deepEqual(expectedFingersForChar("J"), ["R_INDEX"]);
  assert.deepEqual(expectedFingersForChar(","), ["R_MIDDLE"]);
});

test("describeFingers wording", () => {
  assert.equal(describeFingers(["L_INDEX"]), "left index");
  assert.equal(describeFingers(["L_THUMB", "R_THUMB"]), "either thumb");
});
