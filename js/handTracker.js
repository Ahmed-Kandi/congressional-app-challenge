// Runs MediaPipe HandLandmarker on every new camera frame and emits frames
// in the app's frame format: { t, hands: [{ side, landmarks, score }] }.

import {
  FPS_WINDOW_MS,
  HAND_MODEL_URL,
  MEDIAPIPE_BUNDLE_URL,
  MEDIAPIPE_WASM_URL,
  MIN_HAND_DETECTION_CONFIDENCE,
  MIN_HAND_PRESENCE_CONFIDENCE,
  MIN_TRACKING_CONFIDENCE,
  NUM_HANDS,
} from "./config.js";
import { assignSides } from "./handSides.js";

/** The GPU delegate needs WebGL2. Check first so we can explain a CPU fallback. */
export function webglAvailable() {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

/** An error the UI can show; kind is "modelLoad". */
export class TrackerError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

/**
 * Download MediaPipe and the hand model, trying the GPU first.
 * @returns {Promise<{landmarker, delegate: "GPU"|"CPU", gpuProblem: string|null}>}
 */
export async function loadHandLandmarker() {
  let vision;
  let fileset;
  try {
    vision = await import(MEDIAPIPE_BUNDLE_URL);
    fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
  } catch (error) {
    throw new TrackerError("modelLoad", `Could not download MediaPipe: ${error.message}`);
  }

  const create = (delegate) =>
    vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate },
      runningMode: "VIDEO",
      numHands: NUM_HANDS,
      minHandDetectionConfidence: MIN_HAND_DETECTION_CONFIDENCE,
      minHandPresenceConfidence: MIN_HAND_PRESENCE_CONFIDENCE,
      minTrackingConfidence: MIN_TRACKING_CONFIDENCE,
    });

  let gpuProblem = webglAvailable() ? null : "WebGL is not available in this browser.";
  if (!gpuProblem) {
    try {
      return { landmarker: await create("GPU"), delegate: "GPU", gpuProblem: null };
    } catch (error) {
      gpuProblem = `The GPU could not run the hand model (${error.message}).`;
    }
  }
  try {
    return { landmarker: await create("CPU"), delegate: "CPU", gpuProblem };
  } catch (error) {
    throw new TrackerError("modelLoad", `Could not load the hand model: ${error.message}`);
  }
}

/** Convert MediaPipe's result into plain detections: [{ landmarks: [{x,y,z}], score }]. */
export function toDetections(result) {
  return (result.landmarks ?? []).map((points, i) => ({
    landmarks: points.map(({ x, y, z }) => ({ x, y, z })),
    score: result.handedness?.[i]?.[0]?.score ?? 0,
  }));
}

/**
 * Pick the best timestamp for a video frame, all on the performance.now() clock.
 * captureTime (when the camera took the picture) is best; expectedDisplayTime
 * (when it will be shown) is next; the callback's `now` is the fallback.
 */
export function chooseFrameTime(now, metadata) {
  if (typeof metadata?.captureTime === "number" && metadata.captureTime > 0) {
    return { t: metadata.captureTime, source: "captureTime" };
  }
  if (typeof metadata?.expectedDisplayTime === "number" && metadata.expectedDisplayTime > 0) {
    return { t: metadata.expectedDisplayTime, source: "expectedDisplayTime" };
  }
  return { t: now, source: "callback now" };
}

export class HandTracker {
  /**
   * @param {object} options
   * @param {HTMLVideoElement} options.video
   * @param {() => {mirrored: boolean, cameraFacing: string}} options.getSettings
   * @param {(frame) => void} options.onFrame  called once per processed frame
   */
  constructor({ video, getSettings, onFrame }) {
    this.video = video;
    this.getSettings = getSettings;
    this.onFrame = onFrame;
    this.landmarker = null;
    this.running = false;
    this.lastMediapipeTime = -1;
    this.recentFrameTimes = [];
    this.stats = { fps: 0, timestampSource: "none yet", lagMs: 0, delegate: "not loaded", startedAt: 0 };
  }

  async load() {
    const { landmarker, delegate, gpuProblem } = await loadHandLandmarker();
    this.landmarker = landmarker;
    this.stats.delegate = delegate;
    return { delegate, gpuProblem };
  }

  start() {
    if (this.running || !this.landmarker) return;
    this.running = true;
    this.stats.startedAt = performance.now();
    this.scheduleNext();
  }

  stop() {
    this.running = false;
  }

  scheduleNext() {
    if (!this.running) return;
    if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
      // Fires once per new camera frame and tells us when it was captured.
      this.video.requestVideoFrameCallback((now, metadata) => this.processFrame(now, metadata));
    } else {
      // Older browsers: poll every screen refresh. Timestamps are less precise.
      requestAnimationFrame((now) => this.processFrame(now, null));
    }
  }

  processFrame(now, metadata) {
    if (!this.running) return;
    const video = this.video;
    if (video.readyState >= 2 && video.videoWidth > 0) {
      const { t, source } = chooseFrameTime(now, metadata);
      this.stats.timestampSource = metadata ? source : "requestAnimationFrame now (no requestVideoFrameCallback)";

      // MediaPipe insists on strictly increasing timestamps.
      const mediapipeTime = Math.max(this.lastMediapipeTime + 1, Math.round(t));
      this.lastMediapipeTime = mediapipeTime;

      let detections = [];
      try {
        detections = toDetections(this.landmarker.detectForVideo(video, mediapipeTime));
      } catch (error) {
        console.warn("Hand detection failed on one frame:", error);
      }

      const frame = { t, hands: assignSides(detections, this.getSettings()) };
      this.updateStats(t);
      this.onFrame(frame);
    }
    this.scheduleNext();
  }

  updateStats(frameTime) {
    const processedAt = performance.now();
    // Lag: how old a frame is by the time its landmarks are ready.
    this.stats.lagMs = processedAt - frameTime;
    this.recentFrameTimes.push(processedAt);
    while (this.recentFrameTimes[0] < processedAt - FPS_WINDOW_MS) this.recentFrameTimes.shift();
    this.stats.fps = (this.recentFrameTimes.length * 1000) / FPS_WINDOW_MS;
  }
}
