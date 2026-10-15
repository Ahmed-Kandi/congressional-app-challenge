// The single path every frame and keystroke travels through, live or replayed.
//
// Live:   handTracker -> ingestFrame(frame, "live")   keyboard -> ingestKey(e, "live")
// Replay: replay.js   -> ingestFrame(frame, "replay") replay.js -> ingestKey(e, "replay")
//
// Everything downstream (frame buffer, overlay, exercise, attribution, traces)
// listens here, so a replayed recording exercises exactly the same code as
// live input. While replaying, live input is ignored so the two never mix.

export function createPipeline({ frameBuffer }) {
  let source = "live";
  const frameListeners = [];
  const keyListeners = [];

  return {
    frameBuffer,

    get source() {
      return source;
    },

    /** Switch between "live" and "replay". Clears old frames so they cannot mix. */
    setSource(newSource) {
      if (newSource === source) return;
      source = newSource;
      frameBuffer.clear();
    },

    onFrame(listener) {
      frameListeners.push(listener);
    },

    onKey(listener) {
      keyListeners.push(listener);
    },

    ingestFrame(frame, from = "live") {
      if (from !== source) return;
      frameBuffer.push(frame);
      for (const listener of frameListeners) listener(frame, from);
    },

    ingestKey(keyEvent, from = "live") {
      if (from !== source) return;
      for (const listener of keyListeners) listener(keyEvent, from);
    },
  };
}
