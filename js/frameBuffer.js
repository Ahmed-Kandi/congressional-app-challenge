// A rolling window of recent camera frames, so we can look back in time
// when a key is pressed.
//
// Frame format (see handTracker.js):
// { t: performance.now() ms, hands: [{ side: "L"|"R", landmarks: [{x,y,z} x21], score }] }

import { FRAME_BUFFER_WINDOW_MS } from "./config.js";

export class FrameBuffer {
  constructor(windowMs = FRAME_BUFFER_WINDOW_MS) {
    this.windowMs = windowMs;
    this.frames = []; // always sorted by t, oldest first
  }

  push(frame) {
    // Frames normally arrive in time order, so this loop almost never runs.
    // It keeps the list sorted if one shows up late.
    let insertAt = this.frames.length;
    while (insertAt > 0 && this.frames[insertAt - 1].t > frame.t) insertAt -= 1;
    this.frames.splice(insertAt, 0, frame);
    this.evictOld();
  }

  // Drop frames older than windowMs before the newest frame.
  evictOld() {
    const newest = this.frames[this.frames.length - 1];
    if (!newest) return;
    const cutoff = newest.t - this.windowMs;
    let firstKept = 0;
    while (firstKept < this.frames.length && this.frames[firstKept].t < cutoff) firstKept += 1;
    if (firstKept > 0) this.frames.splice(0, firstKept);
  }

  /** Frames with t0 <= t <= t1, oldest first. Returns a new array. */
  between(t0, t1) {
    return this.frames.filter((frame) => frame.t >= t0 && frame.t <= t1);
  }

  /** The newest frame, or null when empty. */
  latest() {
    return this.frames.length > 0 ? this.frames[this.frames.length - 1] : null;
  }

  get size() {
    return this.frames.length;
  }

  clear() {
    this.frames = [];
  }
}
