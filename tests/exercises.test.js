import { test } from "node:test";
import assert from "node:assert/strict";
import { HOME_ROW_CHARACTERS, LEVELS, getExerciseText, getLevel, getTutorial, keysInExercise } from "../js/exercises.js";
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

test("every Level 1 and 2 exercise has a tutorial with a title, intro and tip", () => {
  for (const levelId of [1, 2]) {
    const level = getLevel(levelId);
    assert.equal(level.tutorials.length, level.items.length, `Level ${levelId}: one tutorial per exercise`);
    level.tutorials.forEach((tutorial, i) => {
      for (const field of ["title", "intro", "tip"]) {
        assert.ok(typeof tutorial[field] === "string" && tutorial[field].length > 10, `Level ${levelId} exercise ${i + 1}: missing ${field}`);
      }
    });
  }
});

test("Level 3 has no tutorial", () => {
  assert.equal(getTutorial(3, 0), null);
});

test("keysInExercise lists each key once, in order, with Space last", () => {
  assert.deepEqual(keysInExercise("fff jjj fj"), ["f", "j", "Space"]);
  assert.deepEqual(keysInExercise("a; a;"), ["a", ";", "Space"]);
  assert.deepEqual(keysInExercise("ab"), ["a", "b"]);
});

test("Level 1 tutorials introduce all ten home row keys, a few at a time", () => {
  const introduced = [];
  for (let i = 0; i < getLevel(1).items.length; i += 1) {
    const tutorial = getTutorial(1, i);
    assert.equal(tutorial.text, getExerciseText(1, i));
    assert.ok(tutorial.newKeys.length <= 2, `exercise ${i + 1} introduces ${tutorial.newKeys.join(" ")}`);
    introduced.push(...tutorial.newKeys);
  }
  assert.deepEqual([...introduced].sort(), [..."asdfghjkl;"].sort());
  assert.deepEqual(getTutorial(1, 0).newKeys, ["f", "j"]);
});

test("Level 2 tutorials have no new keys: Level 1 already taught them all", () => {
  for (let i = 0; i < getLevel(2).items.length; i += 1) assert.deepEqual(getTutorial(2, i).newKeys, []);
});

test("getTutorial wraps around like getExerciseText", () => {
  assert.equal(getTutorial(1, 8).title, getTutorial(1, 0).title);
  assert.equal(getTutorial(2, -1).index, 7);
});
