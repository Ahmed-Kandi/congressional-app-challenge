import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TypingSession,
  computeAccuracy,
  computeWpm,
  expectedFingerHistogram,
  fingersCoveringShare,
  topSubstitutions,
} from "../js/session.js";
import { historyEntry, mostMissedKeysFromHistory } from "../js/summaryView.js";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

// Helper: type a string, one key every `gapMs`, starting at t0.
function typeText(session, text, { t0 = 1000, gapMs = 200 } = {}) {
  let t = t0;
  for (const char of text) {
    const code = char === " " ? "Space" : `Key${char.toUpperCase()}`;
    session.handleKey({ code, key: char, t });
    t += gapMs;
  }
}

// ---------- WPM, worked by hand ----------

test("WPM: 50 correct characters in 60 s = 10 words / 1 min = 10 WPM", () => {
  close(computeWpm(50, 60000), 10);
});

test("WPM: 25 characters in 30 s = 5 words / 0.5 min = 10 WPM", () => {
  close(computeWpm(25, 30000), 10);
});

test("WPM: 10 characters in 6 s = 2 words / 0.1 min = 20 WPM", () => {
  close(computeWpm(10, 6000), 20);
});

test("WPM is 0 when no time has passed", () => {
  assert.equal(computeWpm(5, 0), 0);
});

// ---------- Accuracy ----------

test("accuracy: 9 of 10 = 0.9, and null with no keystrokes", () => {
  close(computeAccuracy(9, 10), 0.9);
  assert.equal(computeAccuracy(0, 0), null);
});

// ---------- A whole session ----------

test("perfect session: 'asdf jkl;' typed at 200 ms per key", () => {
  // 9 characters, first at 1000 ms, last at 1000 + 8*200 = 2600 ms -> 1600 ms elapsed.
  // WPM = (9 / 5) / (1600 / 60000) = 1.8 / 0.026666... = 67.5
  const session = new TypingSession("asdf jkl;");
  for (const [i, char] of [..."asdf jkl;"].entries()) {
    const code = { " ": "Space", ";": "Semicolon" }[char] ?? `Key${char.toUpperCase()}`;
    session.handleKey({ code, key: char, t: 1000 + i * 200 });
  }
  const summary = session.summary();
  assert.equal(session.isComplete, true);
  close(summary.wpm, 67.5);
  assert.equal(summary.charAccuracy, 1);
  assert.equal(summary.elapsedMs, 1600);
});

test("mistakes count against accuracy even after Backspace fixes them", () => {
  // Target "sad". Keys: s, x (wrong), Backspace, a, d.
  // Character keystrokes: s, x, a, d = 4, of which 3 correct -> 0.75.
  const session = new TypingSession("sad");
  session.handleKey({ code: "KeyS", key: "s", t: 0 });
  session.handleKey({ code: "KeyX", key: "x", t: 300 });
  session.handleKey({ code: "Backspace", key: "Backspace", t: 600 });
  session.handleKey({ code: "KeyA", key: "a", t: 900 });
  session.handleKey({ code: "KeyD", key: "d", t: 1200 });
  const summary = session.summary();
  close(summary.charAccuracy, 0.75);
  // 3 correct characters on screen in 1200 ms: (3/5) / (1200/60000) = 0.6 / 0.02 = 30 WPM
  close(summary.wpm, 30);
  assert.equal(summary.keystrokeCount, 5);
});

test("wrong characters left on screen do not count toward WPM", () => {
  // Target "add", typed "abd": 2 correct on screen, 1000 ms -> (2/5)/(1000/60000) = 24 WPM
  const session = new TypingSession("add");
  typeText(session, "abd", { t0: 0, gapMs: 500 });
  close(session.summary().wpm, 24);
  close(session.summary().charAccuracy, 2 / 3);
});

test("Shift, arrows, and keys after the end are ignored", () => {
  const session = new TypingSession("a");
  assert.equal(session.handleKey({ code: "ShiftLeft", key: "Shift", t: 0 }), null);
  assert.equal(session.handleKey({ code: "ArrowLeft", key: "ArrowLeft", t: 1 }), null);
  assert.notEqual(session.handleKey({ code: "KeyA", key: "a", t: 2 }), null);
  assert.equal(session.handleKey({ code: "KeyB", key: "b", t: 3 }), null);
  assert.equal(session.keystrokes.length, 1);
});

test("Backspace at the start does nothing", () => {
  const session = new TypingSession("a");
  assert.equal(session.handleKey({ code: "Backspace", key: "Backspace", t: 0 }), null);
});

test("capital letters must match exactly", () => {
  const session = new TypingSession("Ab");
  session.handleKey({ code: "KeyA", key: "a", t: 0 });
  assert.equal(session.typed[0].correct, false);
});

test("live stats use 'now' while typing", () => {
  const session = new TypingSession("asdfasdfasdf");
  typeText(session, "asdfa", { t0: 0, gapMs: 100 });
  // 5 correct, first key at 0, now = 6000 ms -> (5/5)/(6000/60000) = 10 WPM
  const stats = session.liveStats(6000);
  close(stats.wpm, 10);
  assert.equal(stats.typedCount, 5);
  assert.equal(stats.accuracy, 1);
});

test("each keystroke stores its expected fingers", () => {
  const session = new TypingSession("f j");
  typeText(session, "f j");
  assert.deepEqual(session.keystrokes.map((k) => k.expectedFingers), [["L_INDEX"], ["L_THUMB", "R_THUMB"], ["R_INDEX"]]);
});

// ---------- Finger statistics (from finger check results) ----------

test("without finger checks, finger accuracy is not available", () => {
  const session = new TypingSession("asdf");
  typeText(session, "asdf");
  const summary = session.summary();
  assert.equal(summary.fingerCheckAvailable, false);
  assert.equal(summary.fingerAccuracy, null);
  assert.equal(summary.fingersFor90Percent, null);
});

test("finger accuracy and substitutions come from recorded finger checks", () => {
  const session = new TypingSession("ffff");
  typeText(session, "ffff");
  const [a, b, c, d] = session.keystrokes;
  session.recordFingerCheck(a.id, { status: "correct", used: "L_INDEX", confidence: 0.9 });
  session.recordFingerCheck(b.id, { status: "wrong", used: "L_MIDDLE", confidence: 0.9 });
  session.recordFingerCheck(c.id, { status: "wrong", used: "L_MIDDLE", confidence: 0.9 });
  session.recordFingerCheck(d.id, { status: "unavailable", used: null, confidence: null });
  const summary = session.summary();
  // 3 checked (unavailable is skipped), 1 correct -> 1/3
  close(summary.fingerAccuracy, 1 / 3);
  assert.deepEqual(summary.topSubstitutions, [{ expected: "left index", used: "left middle", count: 2 }]);
  const bars = Object.fromEntries(summary.histogram.map((bar) => [bar.id, bar.count]));
  assert.equal(bars.L_INDEX, 1);
  assert.equal(bars.L_MIDDLE, 2);
  assert.equal(summary.histogram.length, 10);
  assert.deepEqual(summary.fingerErrorsByKey.KeyF, {
    label: "F", wrong: 2, total: 3, usedCounts: { L_MIDDLE: 2 },
  });
});

test("missed-key history ranks wrong-finger presses and ignores ordinary typos", () => {
  const session = new TypingSession("fff");
  const first = session.handleKey({ code: "KeyF", key: "f", t: 100 });
  const typo = session.handleKey({ code: "KeyD", key: "d", t: 200 });
  const third = session.handleKey({ code: "KeyF", key: "f", t: 300 });
  for (const keystroke of [first, typo, third]) {
    session.recordFingerCheck(keystroke.id, { status: "wrong", used: "R_INDEX", confidence: 0.9 });
  }
  const marks = { used: { x: 0.2, y: 0.4 }, expected: [{ x: 0.7, y: 0.4 }] };
  session.recordFingerCheck(first.id, { status: "wrong", used: "R_INDEX", confidence: 0.9 }, marks);
  const summary = session.summary();
  assert.equal(summary.fingerErrorsByKey.KeyF.wrong, 2);
  assert.equal(summary.fingerErrorsByKey.KeyD, undefined);
  assert.deepEqual(summary.wrongFingerEvents.map((event) => event.position), [0, 1, 2]);
  assert.deepEqual(summary.wrongFingerEvents.map((event) => event.t), [100, 200, 300]);
  assert.deepEqual(summary.wrongFingerEvents[0].marks, marks);
  const ranked = mostMissedKeysFromHistory([{}, historyEntry(summary)]);
  assert.equal(ranked[0].code, "KeyF");
  assert.equal(ranked[0].wrong, 2);
});

test("fingersCoveringShare: worked examples", () => {
  // 100 keystrokes: 60 + 30 = 90 -> 2 fingers reach 90%.
  assert.equal(fingersCoveringShare({ L_INDEX: 60, R_INDEX: 30, L_MIDDLE: 10 }, 0.9), 2);
  // 50 + 30 = 80 < 90, + 15 = 95 -> 3 fingers.
  assert.equal(fingersCoveringShare({ L_INDEX: 50, R_INDEX: 30, L_MIDDLE: 15, R_RING: 5 }, 0.9), 3);
  // One finger did everything.
  assert.equal(fingersCoveringShare({ R_INDEX: 12, L_INDEX: 0 }, 0.9), 1);
  // Nothing typed.
  assert.equal(fingersCoveringShare({ R_INDEX: 0 }, 0.9), null);
  // 9 of 10 exactly reaches 90% (no float rounding trouble).
  assert.equal(fingersCoveringShare({ L_INDEX: 9, R_INDEX: 1 }, 0.9), 1);
});

test("topSubstitutions keeps the three most common, most common first", () => {
  const wrong = [
    ...Array(3).fill({ expected: ["L_PINKY"], used: "L_RING" }),
    ...Array(5).fill({ expected: ["R_RING"], used: "R_MIDDLE" }),
    ...Array(1).fill({ expected: ["L_INDEX"], used: "R_INDEX" }),
    ...Array(2).fill({ expected: ["L_THUMB", "R_THUMB"], used: "R_INDEX" }),
  ];
  assert.deepEqual(topSubstitutions(wrong, 3), [
    { expected: "right ring", used: "right middle", count: 5 },
    { expected: "left pinky", used: "left ring", count: 3 },
    { expected: "either thumb", used: "right index", count: 2 },
  ]);
});

test("expected-finger histogram puts Space in one 'either thumb' bar", () => {
  const bars = expectedFingerHistogram([
    { expectedFingers: ["L_INDEX"] },
    { expectedFingers: ["L_THUMB", "R_THUMB"] },
    { expectedFingers: ["L_THUMB", "R_THUMB"] },
  ]);
  assert.equal(bars.length, 9);
  assert.equal(bars.find((bar) => bar.id === "THUMB").count, 2);
  assert.equal(bars.find((bar) => bar.id === "L_INDEX").count, 1);
});
