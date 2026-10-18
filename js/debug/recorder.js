// Records live frames and key events so a typing session can be saved as JSON
// and studied or replayed later. Recordings stay on the computer: the file is
// created in the browser and downloaded, never uploaded.

import { RECORDING_MAX_FRAMES } from "../config.js";

export const RECORDING_FORMAT = "typing-form-coach-recording";
export const RECORDING_VERSION = 1;

/** Put frames, key events and context into one recording object. */
export function buildRecording({ frames, keyEvents, meta = {} }) {
  return { format: RECORDING_FORMAT, version: RECORDING_VERSION, meta, frames, keyEvents };
}

/** Recording -> JSON text. Kept separate from downloading so it can be tested in Node. */
export function serializeRecording(recording) {
  return JSON.stringify(recording);
}

export class Recorder {
  constructor() {
    this.frames = [];
    this.keyEvents = [];
    this.meta = null;
    this.recording = false;
  }

  /** @param {object} meta  context saved with the recording (settings, exercise, calibration) */
  start(meta) {
    this.frames = [];
    this.keyEvents = [];
    this.meta = { ...meta, startedAt: new Date().toISOString() };
    this.recording = true;
  }

  addFrame(frame) {
    if (!this.recording) return;
    this.frames.push(frame);
    // Stop on our own instead of letting a forgotten recording eat all memory.
    if (this.frames.length >= RECORDING_MAX_FRAMES) this.recording = false;
  }

  addKey(keyEvent) {
    if (this.recording) this.keyEvents.push({ code: keyEvent.code, key: keyEvent.key, t: keyEvent.t });
  }

  /** Stop and return the finished recording. */
  stop(extraMeta = {}) {
    this.recording = false;
    return buildRecording({
      frames: this.frames,
      keyEvents: this.keyEvents,
      meta: { ...this.meta, ...extraMeta, stoppedAt: new Date().toISOString() },
    });
  }
}

/** Save a recording as a .json file through the browser's normal download. */
export function downloadRecording(recording) {
  const blob = new Blob([serializeRecording(recording)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `typing-recording-${stamp}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
