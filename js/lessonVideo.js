// Keep the current lesson's camera footage in memory for the results replay.
// Nothing is uploaded or saved to browser storage.

export class LessonVideoRecorder {
  constructor({ Recorder = globalThis.MediaRecorder, urls = globalThis.URL, now = () => performance.now() } = {}) {
    this.Recorder = Recorder;
    this.urls = urls;
    this.now = now;
    this.capture = null;
    this.clip = null;
  }

  start(stream, view = {}) {
    this.clear();
    if (!this.Recorder || !stream?.getVideoTracks?.().some((track) => track.readyState === "live")) return false;

    try {
      const recorder = new this.Recorder(stream);
      const capture = {
        recorder,
        chunks: [],
        startedAt: this.now(),
        stoppedAt: null,
        discarded: false,
        view: { rotated: Boolean(view.rotated), flipped: Boolean(view.flipped) },
      };
      capture.finished = new Promise((resolve) => {
        recorder.ondataavailable = (event) => {
          if (event.data?.size) capture.chunks.push(event.data);
        };
        recorder.onerror = () => {
          capture.discarded = true;
          try {
            if (recorder.state !== "inactive") recorder.stop();
            else resolve(null);
          } catch { resolve(null); }
        };
        recorder.onstop = () => {
          if (capture.discarded || this.capture !== capture || !capture.chunks.length) {
            resolve(null);
            return;
          }
          try {
            const blob = new Blob(capture.chunks, { type: recorder.mimeType || capture.chunks[0].type || "video/webm" });
            this.clip = {
              url: this.urls.createObjectURL(blob),
              startedAt: capture.startedAt,
              durationMs: Math.max(0, (capture.stoppedAt ?? this.now()) - capture.startedAt),
              ...capture.view,
            };
            resolve(this.clip);
          } catch { resolve(null); }
        };
      });
      recorder.start(250);
      this.capture = capture;
      return true;
    } catch {
      this.capture = null;
      return false;
    }
  }

  stop() {
    const capture = this.capture;
    if (!capture) return Promise.resolve(this.clip);
    if (capture.recorder.state !== "inactive") {
      capture.stoppedAt = this.now();
      try { capture.recorder.stop(); } catch {
        capture.discarded = true;
        return Promise.resolve(null);
      }
    }
    return capture.finished;
  }

  clear() {
    if (this.capture) {
      this.capture.discarded = true;
      try {
        if (this.capture.recorder.state !== "inactive") this.capture.recorder.stop();
      } catch { /* The camera may already have ended. */ }
      this.capture = null;
    }
    if (this.clip) this.urls.revokeObjectURL(this.clip.url);
    this.clip = null;
  }
}

export function timeInClip(eventTime, clip) {
  return Math.max(0, Math.min(clip.durationMs / 1000, (eventTime - clip.startedAt) / 1000));
}
