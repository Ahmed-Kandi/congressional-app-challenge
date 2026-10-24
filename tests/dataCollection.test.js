import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTION_CODES,
  buildPrompts,
  createCollectionSession,
  describePrompt,
  makeRandom,
  wrongFingerFor,
} from "../js/debug/dataCollection.js";
import { resolveLabels } from "../js/debug/labels.js";
import { FINGERS, expectedFingers } from "../js/fingerMap.js";

const OPTIONS = { repeats: 3, wrongShare: 0.2, seed: 7 };
const key = (code, t, keyName = code) => ({ code, key: keyName, t });

test("buildPrompts asks for every key the right number of times, plus 4 Space prompts", () => {
  const prompts = buildPrompts(OPTIONS);
  assert.equal(prompts.length, COLLECTION_CODES.length * 3 + 4);
  for (const code of COLLECTION_CODES) {
    assert.equal(prompts.filter((p) => p.code === code).length, 3, code);
  }
  assert.deepEqual(prompts.filter((p) => p.code === "Space").map((p) => p.finger).sort(), ["L_THUMB", "L_THUMB", "R_THUMB", "R_THUMB"]);
});

test("buildPrompts: exactly round(share x key prompts) ask for a wrong finger, on the same hand", () => {
  const prompts = buildPrompts(OPTIONS);
  const wrong = prompts.filter((p) => p.onPurposeWrong);
  assert.equal(wrong.length, Math.round(COLLECTION_CODES.length * 3 * 0.2));
  for (const p of wrong) {
    const expected = expectedFingers(p.code)[0];
    assert.notEqual(p.finger, expected, `${p.code}`);
    assert.equal(p.finger[0], expected[0], `${p.code}: wrong finger should be on the same hand`);
  }
  for (const p of prompts.filter((x) => !x.onPurposeWrong)) {
    assert.ok(expectedFingers(p.code).includes(p.finger), `${p.code} asked with ${p.finger}`);
  }
});

test("buildPrompts is repeatable from its seed and changes with it", () => {
  assert.deepEqual(buildPrompts(OPTIONS), buildPrompts(OPTIONS));
  assert.notDeepEqual(buildPrompts(OPTIONS), buildPrompts({ ...OPTIONS, seed: 8 }));
});

test("wrongFingerFor always gives a different finger on the same hand", () => {
  const random = makeRandom(3);
  for (const finger of FINGERS.filter((f) => !f.endsWith("THUMB"))) {
    for (let i = 0; i < 50; i += 1) {
      const wrong = wrongFingerFor(finger, random);
      assert.ok(FINGERS.includes(wrong), wrong);
      assert.notEqual(wrong, finger);
      assert.equal(wrong[0], finger[0]);
    }
  }
});

test("describePrompt names the key and finger and flags on-purpose mistakes", () => {
  assert.equal(describePrompt({ label: "F", finger: "L_INDEX", onPurposeWrong: false }), "Press F with your left index finger.");
  assert.equal(describePrompt({ label: "Space", finger: "R_THUMB", onPurposeWrong: false }), "Press Space with your right thumb.");
  assert.equal(
    describePrompt({ label: "F", finger: "L_MIDDLE", onPurposeWrong: true }),
    "Press F with your left middle finger (wrong on purpose).",
  );
});

const PROMPTS = [
  { code: "KeyF", label: "F", finger: "L_INDEX", onPurposeWrong: false },
  { code: "KeyJ", label: "J", finger: "R_MIDDLE", onPurposeWrong: true },
  { code: "Space", label: "Space", finger: "L_THUMB", onPurposeWrong: false },
];

test("a session labels matching keys and skips wrong keys, hidden hands and undone keys", () => {
  const session = createCollectionSession(PROMPTS);
  const seen = { handsVisible: true };
  const keys = [
    key("KeyF", 100, "f"), // 1: counted, left index
    key("KeyK", 200, "k"), // 2: wrong key, skipped, J still asked
    key("KeyJ", 300, "j"), // 3: counted, right middle on purpose
    key("Backspace", 400), // 4: undoes key 3, J asked again
    key("KeyJ", 500, "j"), // 5: hands hidden, skipped
    key("KeyJ", 600, "j"), // 6: counted
    key("Space", 700, " "), // 7: counted, left thumb, finishes
    key("KeyA", 800, "a"), // 8: after the end, skipped
  ];
  const results = keys.map((k) => session.handleKey(k, k.t === 500 ? { handsVisible: false } : seen));

  assert.deepEqual(results.map((r) => r.counted), [true, false, true, false, false, true, true, false]);
  assert.match(results[1].message, /That was k, not counted\. Press J with your right middle finger \(wrong on purpose\)/);
  assert.match(results[3].message, /Removed the last key\. Press J/);
  assert.match(results[4].message, /Both hands must be in view/);
  assert.equal(session.finished, true);
  assert.equal(session.countedKeys, 3);

  const labels = session.labels({ typist: "test" });
  assert.equal(labels.typist, "test");
  assert.deepEqual(resolveLabels(keys, labels), [["L_INDEX"], null, null, null, null, ["R_MIDDLE"], ["L_THUMB"], null]);
});

test("Backspace with nothing to undo is skipped and changes nothing", () => {
  const session = createCollectionSession(PROMPTS);
  const result = session.handleKey(key("Backspace", 1), { handsVisible: true });
  assert.equal(result.counted, false);
  assert.match(result.message, /Nothing to undo\. Press F/);
  assert.deepEqual(session.progress, { done: 0, total: 3 });
});
