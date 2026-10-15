import { test } from "node:test";
import assert from "node:assert/strict";
import { FrameBuffer } from "../js/frameBuffer.js";

const frameAt = (t) => ({ t, hands: [] });

test("starts empty", () => {
  const buffer = new FrameBuffer(2000);
  assert.equal(buffer.size, 0);
  assert.equal(buffer.latest(), null);
  assert.deepEqual(buffer.between(0, 1e9), []);
});

test("default window is 2000 ms", () => {
  assert.equal(new FrameBuffer().windowMs, 2000);
});

test("between() is inclusive on both ends and in time order", () => {
  const buffer = new FrameBuffer(2000);
  for (const t of [100, 133, 166, 200, 233]) buffer.push(frameAt(t));
  assert.deepEqual(buffer.between(133, 200).map((f) => f.t), [133, 166, 200]);
  assert.deepEqual(buffer.between(134, 199).map((f) => f.t), [166]);
  assert.deepEqual(buffer.between(500, 600), []);
});

test("latest() returns the newest frame", () => {
  const buffer = new FrameBuffer(2000);
  buffer.push(frameAt(10));
  buffer.push(frameAt(20));
  assert.equal(buffer.latest().t, 20);
});

test("evicts frames older than the window on push", () => {
  const buffer = new FrameBuffer(1000);
  for (let t = 0; t <= 3000; t += 100) buffer.push(frameAt(t));
  const times = buffer.between(-Infinity, Infinity).map((f) => f.t);
  assert.equal(times[0], 2000, "oldest kept frame is exactly windowMs before the newest");
  assert.equal(times[times.length - 1], 3000);
  assert.equal(buffer.size, 11);
});

test("keeps time order when a frame arrives late", () => {
  const buffer = new FrameBuffer(2000);
  buffer.push(frameAt(100));
  buffer.push(frameAt(300));
  buffer.push(frameAt(200));
  assert.deepEqual(buffer.between(0, 1000).map((f) => f.t), [100, 200, 300]);
  assert.equal(buffer.latest().t, 300);
});

test("between() returns a copy, so callers cannot damage the buffer", () => {
  const buffer = new FrameBuffer(2000);
  buffer.push(frameAt(1));
  buffer.between(0, 10).pop();
  assert.equal(buffer.size, 1);
});

test("clear() empties the buffer", () => {
  const buffer = new FrameBuffer(2000);
  buffer.push(frameAt(1));
  buffer.clear();
  assert.equal(buffer.size, 0);
  assert.equal(buffer.latest(), null);
});
