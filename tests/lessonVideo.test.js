import { test } from "node:test";
import assert from "node:assert/strict";
import { LessonVideoRecorder, timeInClip } from "../js/lessonVideo.js";

class FakeMediaRecorder {
  constructor() {
    this.state = "inactive";
    this.mimeType = "video/webm";
  }
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["camera frames"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const liveStream = { getVideoTracks: () => [{ readyState: "live" }] };

test("lesson video is held for replay, timed to keys, and released afterward", async () => {
  let now = 1000;
  const revoked = [];
  const recorder = new LessonVideoRecorder({
    Recorder: FakeMediaRecorder,
    urls: { createObjectURL: () => "blob:lesson", revokeObjectURL: (url) => revoked.push(url) },
    now: () => now,
  });
  assert.equal(recorder.start(liveStream, { rotated: true }), true);
  now = 4500;
  const clip = await recorder.stop();
  assert.equal(clip.url, "blob:lesson");
  assert.equal(clip.durationMs, 3500);
  assert.equal(clip.rotated, true);
  assert.equal(timeInClip(2300, clip), 1.3);
  assert.equal(timeInClip(9000, clip), 3.5);
  recorder.clear();
  assert.deepEqual(revoked, ["blob:lesson"]);
  assert.equal(recorder.clip, null);
});

test("lessons without a live camera do not create a recording", async () => {
  const recorder = new LessonVideoRecorder({ Recorder: FakeMediaRecorder });
  assert.equal(recorder.start({ getVideoTracks: () => [{ readyState: "ended" }] }), false);
  assert.equal(await recorder.stop(), null);
});
