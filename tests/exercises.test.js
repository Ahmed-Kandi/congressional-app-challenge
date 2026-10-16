import { test } from "node:test";
import assert from "node:assert/strict";
import { HOME_ROW_CHARACTERS, LEVELS, getExerciseText, getLevel } from "../js/exercises.js";
import { codeForChar } from "../js/fingerMap.js";

const HOME_ROW_ONLY = /^[asdfghjkl; ]+$/;

test("there are three levels with ids 1, 2, 3", () => {
  assert.deepEqual(LEVELS.map((level) => level.id), [1, 2, 3]);
});

for (const levelId of [1, 2]) {
  test(`Level ${levelId} uses only home row characters and spaces`, () => {
    for (const item of getLevel(levelId).items) {
      assert.match(item, HOME_ROW_ONLY, `"${item}" has a non home row character`);
      for (const char of item) assert.ok(HOME_ROW_CHARACTERS.has(char), `"${char}" in "${item}"`);
    }
  });
}

test("Level 1 drills anchor on F and J", () => {
  for (const item of getLevel(1).items) {
    assert.ok(item.includes("f") && item.includes("j"), `"${item}" should use both anchor keys`);
  }
});

test("Level 3 has 8 to 12 sentences of 40 to 80 characters", () => {
  const sentences = getLevel(3).items;
  assert.ok(sentences.length >= 8 && sentences.length <= 12, `${sentences.length} sentences`);
  for (const sentence of sentences) {
    assert.ok(sentence.length >= 40 && sentence.length <= 80, `${sentence.length} chars: "${sentence}"`);
  }
});

test("Level 3 covers every letter of the alphabet", () => {
  const letters = new Set(getLevel(3).items.join("").toLowerCase().replace(/[^a-z]/g, ""));
  const missing = [..."abcdefghijklmnopqrstuvwxyz"].filter((letter) => !letters.has(letter));
  assert.deepEqual(missing, []);
});

test("every character in every exercise is typeable on US QWERTY", () => {
  for (const level of LEVELS) {
    for (const item of level.items) {
      for (const char of item) assert.notEqual(codeForChar(char), null, `"${char}" in "${item}"`);
    }
  }
});

test("no exercise has leading, trailing, or double spaces", () => {
  for (const level of LEVELS) {
    for (const item of level.items) {
      assert.equal(item, item.trim(), `"${item}"`);
      assert.ok(!item.includes("  "), `"${item}"`);
    }
  }
});

test("getExerciseText wraps around past the end", () => {
  const items = getLevel(2).items;
  assert.equal(getExerciseText(2, 0), items[0]);
  assert.equal(getExerciseText(2, items.length), items[0]);
  assert.equal(getExerciseText(2, items.length + 1), items[1]);
  assert.equal(getExerciseText(99, 0), null);
});
