// Tests for the feedback layer around the team's function: validating what it
// returns and comparing it to the expected finger. (Results here are typed in
// by hand; nothing computes a finger.)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  beatKind,
  evaluateAttribution,
  feedbackMessage,
  isWrongHand,
  runAttribution,
  wrongKeyMessage,
} from "../js/feedback.js";
import { MIN_ATTRIBUTION_CONFIDENCE } from "../js/config.js";
import { ATTRIBUTION_IMPLEMENTED, attributeKeystroke } from "../js/core/fingerAttribution.js";
import { FrameBuffer } from "../js/frameBuffer.js";

const key = { code: "KeyF", key: "f", t: 1000 };
const fixed = (value) => () => value;

test("the implemented finger check stays neutral without camera frames", () => {
  assert.equal(ATTRIBUTION_IMPLEMENTED, true);
  assert.equal(attributeKeystroke(key, new FrameBuffer(), null), null);
});

test("runAttribution passes a valid result through", () => {
  const result = { finger: "L_INDEX", confidence: 0.8 };
  assert.deepEqual(runAttribution(fixed(result), key, new FrameBuffer(), null), { result, problem: null });
});

test("runAttribution treats null as 'no answer' without a problem", () => {
  assert.deepEqual(runAttribution(fixed(null), key, new FrameBuffer(), null), { result: null, problem: null });
});

test("runAttribution survives a throwing function", () => {
  const { result, problem } = runAttribution(() => { throw new Error("boom"); }, key, new FrameBuffer(), null);
  assert.equal(result, null);
  assert.match(problem, /boom/);
});

test("runAttribution rejects unknown fingers and bad confidence", () => {
  assert.equal(runAttribution(fixed({ finger: "L_TOE", confidence: 1 }), key, null, null).result, null);
  assert.equal(runAttribution(fixed({ finger: "L_INDEX", confidence: 2 }), key, null, null).result, null);
  assert.equal(runAttribution(fixed({ finger: "L_INDEX" }), key, null, null).result, null);
  assert.equal(runAttribution(fixed("L_INDEX"), key, null, null).result, null);
});

test("evaluateAttribution: correct, wrong, low confidence, null", () => {
  assert.equal(evaluateAttribution({ finger: "L_INDEX", confidence: 0.9 }, ["L_INDEX"]).status, "correct");
  assert.deepEqual(evaluateAttribution({ finger: "R_MIDDLE", confidence: 0.9 }, ["L_INDEX"]), {
    status: "wrong",
    used: "R_MIDDLE",
    confidence: 0.9,
  });
  assert.equal(
    evaluateAttribution({ finger: "R_MIDDLE", confidence: MIN_ATTRIBUTION_CONFIDENCE - 0.01 }, ["L_INDEX"]).status,
    "unavailable",
  );
  assert.equal(evaluateAttribution(null, ["L_INDEX"]).status, "unavailable");
});

test("either thumb is correct for Space", () => {
  for (const finger of ["L_THUMB", "R_THUMB"]) {
    assert.equal(evaluateAttribution({ finger, confidence: 1 }, ["L_THUMB", "R_THUMB"]).status, "correct");
  }
});

test("messages say right or wrong in words, not just color", () => {
  assert.equal(
    feedbackMessage({ status: "wrong", used: "L_MIDDLE" }, ["L_INDEX"]),
    "Wrong finger: used left middle, should be left index.",
  );
  assert.equal(
    feedbackMessage({ status: "wrong", used: "R_MIDDLE" }, ["L_INDEX"]),
    "Wrong hand: used right middle, should be left index.",
  );
  assert.equal(feedbackMessage({ status: "correct", used: "L_INDEX" }, ["L_INDEX"]), "Correct finger: left index.");
  assert.equal(feedbackMessage({ status: "unavailable" }, ["L_INDEX"]), "Finger check unavailable.");
});

test("a typo is described as a wrong key, naming Space in words", () => {
  assert.equal(wrongKeyMessage("d", "f"), 'Wrong key: you typed "d", the text needs "f".');
  assert.equal(wrongKeyMessage(" ", "a"), 'Wrong key: you typed Space, the text needs "a".');
  assert.equal(wrongKeyMessage("j", " "), 'Wrong key: you typed "j", the text needs Space.');
});

test("wrong hand means the finger used is on the other hand from every expected finger", () => {
  assert.equal(isWrongHand({ status: "wrong", used: "R_INDEX" }, ["L_INDEX"]), true);
  assert.equal(isWrongHand({ status: "wrong", used: "L_MIDDLE" }, ["L_INDEX"]), false);
  assert.equal(isWrongHand({ status: "correct", used: "L_INDEX" }, ["L_INDEX"]), false);
  assert.equal(isWrongHand({ status: "unavailable", used: null }, ["L_INDEX"]), false);
  // Space accepts either thumb, so no finger there is ever the "wrong hand".
  assert.equal(isWrongHand({ status: "wrong", used: "R_INDEX" }, ["L_THUMB", "R_THUMB"]), false);
});

test("beat flash: green for right key and finger, orange for the other hand, red otherwise, none when unsure", () => {
  // F expects the left index.
  const typed = (correct) => ({ kind: "char", correct, expectedFingers: ["L_INDEX"] });
  assert.equal(beatKind(typed(true), { status: "correct", used: "L_INDEX" }), "good");
  assert.equal(beatKind(typed(true), { status: "wrong", used: "L_MIDDLE" }), "bad");
  assert.equal(beatKind(typed(true), { status: "wrong", used: "R_INDEX" }), "warn");
  assert.equal(beatKind(typed(true), { status: "unavailable", used: null }), null);
  assert.equal(beatKind(typed(false), { status: "correct", used: "L_INDEX" }), "bad");
  assert.equal(beatKind(typed(false), null), "bad");
  assert.equal(beatKind({ kind: "backspace", correct: null, expectedFingers: ["R_PINKY"] }, { status: "correct" }), null);
});
