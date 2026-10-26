import { test } from "node:test";
import assert from "node:assert/strict";
import { computeKeyboardGrid } from "../js/keyboardGrid.js";
import { Overlay } from "../js/overlay.js";
import { restingHand, syntheticCornerTouches } from "./synthetic.js";

test("camera finger tags include the mapped key below each fingertip", () => {
  const labels = [];
  const context = {
    measureText: (text) => ({ width: text.length * 9 }),
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillRect() {}, strokeRect() {},
    fillText: (text) => labels.push(text),
  };
  const canvas = { width: 640, height: 360, clientWidth: 640, clientHeight: 360, getContext: () => context };
  const overlay = new Overlay(canvas, null);
  overlay.hoverGrid = computeKeyboardGrid(syntheticCornerTouches()).grid;
  overlay.drawFingerLabels([{ side: "L", landmarks: restingHand("L") }]);
  assert.ok(labels.includes("index · F"));
  assert.ok(labels.includes("pinky · A"));
});
