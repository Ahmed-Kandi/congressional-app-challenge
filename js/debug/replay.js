// Loads a recording and plays it back through the same pipeline as live
// input (pipeline.ingestFrame / ingestKey with source "replay"), in real time,
// so the frame buffer, exercise, finger check and traces all run exactly as
// they did live.

import { REPLAY_END_HOLD_MS } from "../config.js";
import { LANDMARK_COUNT } from "../landmarks.js";
import { RECORDING_FORMAT, RECORDING_VERSION } from "./recorder.js";

/** JSON text -> recording. Throws an Error with a readable message if the file is wrong. */
export function parseRecording(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (data?.format !== RECORDING_FORMAT) throw new Error("This file is not a Typing Form Coach recording.");
  if (data.version !== RECORDING_VERSION) throw new Error(`Unsupported recording version ${data.version}.`);
  if (!Array.isArray(data.frames) || !Array.isArray(data.keyEvents)) throw new Error("The recording has no frames or key events.");
  for (const frame of data.frames) {
    if (typeof frame?.t !== "number" || !Array.isArray(frame.hands)) throw new Error("A frame is missing its time or hands.");
    for (const hand of frame.hands) {
      if ((hand.side !== "L" && hand.side !== "R") || hand.landmarks?.length !== LANDMARK_COUNT) {
        throw new Error("A hand in the recording is malformed.");
      }
    }
  }
  for (const keyEvent of data.keyEvents) {
    if (typeof keyEvent?.t !== "number" || typeof keyEvent.code !== "string") throw new Error("A key event is malformed.");
  }
  return data;
}

/**
 * Merge frames and key events into one time-ordered list, shifted so the
 * first event happens at `newStart` on today's performance.now() clock.
 * Only the clock moves; every gap between events stays exactly the same.
 */
export function timelineFrom(recording, newStart) {
  const all = [
    ...recording.frames.map((frame) => ({ type: "frame", t: frame.t, data: frame })),
    ...recording.keyEvents.map((keyEvent) => ({ type: "key", t: keyEvent.t, data: keyEvent })),
  ];
  if (all.length === 0) return [];
  // A loop rather than Math.min(...array): long recordings have too many items to spread.
  const firstTime = all.reduce((min, event) => Math.min(min, event.t), Infinity);
  const shift = newStart - firstTime;
  // Frames before keys at the same instant, matching live order (a key is
  // handled when it happens; its frames are already in the buffer).
  all.sort((a, b) => a.t - b.t || (a.type === "frame" ? -1 : 1));
  return all.map((event) => ({ ...event, t: event.t + shift, data: { ...event.data, t: event.t + shift } }));
}

/**
 * Play a recording through the pipeline.
 * @param {object} options
 * @param {object} options.pipeline
 * @param {(progress: {done: number, total: number, seconds: number, totalSeconds: number}) => void} [options.onProgress]
 * @param {() => void} [options.onEnd]
 */
export function createReplayer({ pipeline, onProgress = () => {}, onEnd = () => {} }) {
  let timer = null;
  let timeline = [];
  let next = 0;

  function play(recording) {
    stop();
    pipeline.setSource("replay");
    timeline = timelineFrom(recording, performance.now() + 50);
    next = 0;
    step();
  }

  function step() {
    const now = performance.now();
    while (next < timeline.length && timeline[next].t <= now) {
      const event = timeline[next];
      if (event.type === "frame") pipeline.ingestFrame(event.data, "replay");
      else pipeline.ingestKey(event.data, "replay");
      next += 1;
    }
    const startTime = timeline[0]?.t ?? now;
    const endTime = timeline[timeline.length - 1]?.t ?? now;
    onProgress({
      done: next,
      total: timeline.length,
      seconds: Math.max(0, Math.min(now, endTime) - startTime) / 1000,
      totalSeconds: (endTime - startTime) / 1000,
    });
    if (next >= timeline.length) {
      finish();
      return;
    }
    // A short timer instead of requestAnimationFrame, so replay keeps going
    // in a background tab.
    timer = setTimeout(step, 4);
  }

  // Stay on replay a moment after the last event so the last key's finger
  // check and motion trace still find the replayed frames in the buffer.
  function finish() {
    timer = setTimeout(() => {
      timer = null;
      pipeline.setSource("live");
      onEnd();
    }, REPLAY_END_HOLD_MS);
  }

  function stop() {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    pipeline.setSource("live");
    onEnd();
  }

  return { play, stop, get playing() { return timer !== null; } };
}
