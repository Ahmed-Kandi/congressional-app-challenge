import { test } from "node:test";
import assert from "node:assert/strict";
import { Recorder, buildRecording, serializeRecording } from "../js/debug/recorder.js";
import { parseRecording, timelineFrom } from "../js/debug/replay.js";
import { generateSynthetic } from "./synthetic.js";

function syntheticRecording() {
  const { frames, keyEvents } = generateSynthetic({
    fps: 60,
    durationMs: 1500,
    presses: [
      { finger: "L_INDEX", t: 1300 },
      { finger: "R_RING", t: 1700 },
      { finger: "L_PINKY", t: 2100 },
    ],
  });
  return buildRecording({ frames, keyEvents, meta: { settings: { mirrored: false, cameraFacing: "above" }, note: "synthetic" } });
}

test("a synthetic recording survives a save and load round trip unchanged", () => {
  const original = syntheticRecording();
  const loaded = parseRecording(serializeRecording(original));
  assert.deepEqual(loaded, original);
  // Spot-check that floating point coordinates came back bit-for-bit.
  assert.equal(loaded.frames[17].hands[1].landmarks[8].z, original.frames[17].hands[1].landmarks[8].z);
});

test("Recorder collects frames and keys only while recording", () => {
  const recorder = new Recorder();
  recorder.addFrame({ t: 1, hands: [] });
  recorder.start({ note: "x" });
  recorder.addFrame({ t: 2, hands: [] });
  recorder.addKey({ code: "KeyF", key: "f", t: 3, extra: "dropped" });
  const recording = recorder.stop();
  recorder.addFrame({ t: 4, hands: [] });
  assert.deepEqual(recording.frames, [{ t: 2, hands: [] }]);
  assert.deepEqual(recording.keyEvents, [{ code: "KeyF", key: "f", t: 3 }]);
  assert.equal(recording.meta.note, "x");
  assert.ok(recording.meta.startedAt && recording.meta.stoppedAt);
});

test("parseRecording rejects files that are not recordings", () => {
  assert.throws(() => parseRecording("not json"), /not valid JSON/);
  assert.throws(() => parseRecording("{}"), /not a Typing Form Coach recording/);
  const bad = syntheticRecording();
  bad.frames[0].hands[0].landmarks.pop();
  assert.throws(() => parseRecording(serializeRecording(bad)), /malformed/);
});

test("replay timeline keeps every gap but moves the clock", () => {
  const recording = syntheticRecording();
  const timeline = timelineFrom(recording, 50000);
  assert.equal(timeline.length, recording.frames.length + recording.keyEvents.length);
  assert.equal(timeline[0].t, 50000);
  const shift = 50000 - recording.frames[0].t;
  const keys = timeline.filter((event) => event.type === "key");
  assert.deepEqual(keys.map((event) => event.t), recording.keyEvents.map((k) => k.t + shift));
  for (let i = 1; i < timeline.length; i += 1) assert.ok(timeline[i].t >= timeline[i - 1].t);
  // The original recording is not modified.
  assert.equal(recording.keyEvents[0].t, 1300);
});
