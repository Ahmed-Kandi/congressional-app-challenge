import { test } from "node:test";
import assert from "node:assert/strict";
import { createWalkthrough, fingersForKey, keyLabel, keyRole, tutorialKeyCode } from "../js/tutorial.js";

test("tutorial keys map to physical key codes and fingers", () => {
  assert.equal(tutorialKeyCode("f"), "KeyF");
  assert.equal(tutorialKeyCode(";"), "Semicolon");
  assert.equal(tutorialKeyCode("Space"), "Space");
  assert.deepEqual(fingersForKey("f"), ["L_INDEX"]);
  assert.deepEqual(fingersForKey(";"), ["R_PINKY"]);
  assert.deepEqual(fingersForKey("Space"), ["L_THUMB", "R_THUMB"]);
  assert.equal(keyLabel("g"), "G");
  assert.equal(keyLabel("Space"), "Space");
});

test("key roles: home keys, index reaches, and the space bar", () => {
  assert.match(keyRole("f"), /home key/);
  assert.match(keyRole(";"), /home key/);
  assert.match(keyRole("g"), /reach from F/);
  assert.match(keyRole("h"), /reach from J/);
  assert.equal(keyRole("Space"), "between words");
});

test("the walk-through moves on only for the right key, then finishes", () => {
  const walk = createWalkthrough(["f", "j", "Space"]);
  assert.equal(walk.current, "f");
  assert.equal(walk.press("KeyD"), "wrong");
  assert.equal(walk.current, "f");
  assert.equal(walk.press("KeyF"), "correct");
  assert.equal(walk.current, "j");
  assert.equal(walk.press("KeyJ"), "correct");
  assert.equal(walk.done, false);
  assert.equal(walk.press("Space"), "done");
  assert.equal(walk.done, true);
  assert.equal(walk.current, null);
  assert.equal(walk.press("KeyF"), "ignored");
});
