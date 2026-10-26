// Home row calibration: the student rests all fingers on the home row and holds
// still while we average where each fingertip and wrist appears in the image.
//
// This is a measuring tool only. It records resting positions that the team's
// attribution code may use; it never decides which finger pressed a key.

import {
  CALIBRATION_DURATION_MS,
  CALIBRATION_MIN_BOTH_HANDS_RATIO,
  CALIBRATION_SETTLE_MS,
} from "./config.js";
import { FINGERS } from "./fingerMap.js";
import { GRID_CORNERS, computeKeyboardGrid } from "./keyboardGrid.js";
import { INDEX_TIP, PINKY_TIP, WRIST, fingertipLocation } from "./landmarks.js";
import { KEYS, storage } from "./storage.js";

function averagePoint(points) {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y, z: acc.z + p.z }), { x: 0, y: 0, z: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length, z: sum.z / points.length };
}

function distance2d(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Average resting positions from frames captured while the hands held still.
 * @param {Array} frames  frames in the app's frame format
 * @returns {{ok: true, calibration: object} | {ok: false, reason: string, bothHandsRatio: number}}
 */
export function computeCalibration(frames, createdAt = new Date().toISOString()) {
  const bothHandFrames = frames.filter(
    (frame) => frame.hands.some((h) => h.side === "L") && frame.hands.some((h) => h.side === "R"),
  );
  const bothHandsRatio = frames.length === 0 ? 0 : bothHandFrames.length / frames.length;
  if (bothHandsRatio < CALIBRATION_MIN_BOTH_HANDS_RATIO) {
    return {
      ok: false,
      bothHandsRatio,
      reason: `Both hands were visible in only ${Math.round(bothHandsRatio * 100)}% of frames (need ${Math.round(
        CALIBRATION_MIN_BOTH_HANDS_RATIO * 100,
      )}%).`,
    };
  }

  const handOf = (frame, side) => frame.hands.find((h) => h.side === side);

  const baselines = {};
  for (const finger of FINGERS) {
    const { side, index } = fingertipLocation(finger);
    baselines[finger] = averagePoint(bothHandFrames.map((frame) => handOf(frame, side).landmarks[index]));
  }

  const wristBaselines = {
    L: averagePoint(bothHandFrames.map((frame) => handOf(frame, "L").landmarks[WRIST])),
    R: averagePoint(bothHandFrames.map((frame) => handOf(frame, "R").landmarks[WRIST])),
  };

  // Hand span: distance from index tip to pinky tip, averaged over both hands
  // and all frames, in normalized image units. A yardstick for "how big is a
  // hand in this camera view", useful for scaling movement thresholds.
  const spans = bothHandFrames.flatMap((frame) =>
    ["L", "R"].map((side) => {
      const points = handOf(frame, side).landmarks;
      return distance2d(points[INDEX_TIP], points[PINKY_TIP]);
    }),
  );
  const handSpan = spans.reduce((sum, value) => sum + value, 0) / spans.length;

  return { ok: true, calibration: { createdAt, baselines, wristBaselines, handSpan } };
}

export function loadCalibration() {
  return storage.getJSON(KEYS.calibration, null);
}

export function saveCalibration(calibration) {
  return storage.setJSON(KEYS.calibration, calibration);
}

/**
 * Run the Calibrate screen.
 * @param {object} options
 * @param {object} options.elements  { countdown, progress, status, startButton }
 * @param {object} options.pipeline  frames arrive through pipeline.onFrame
 * @param {(calibration: object) => void} options.onSuccess
 */
export function createCalibrationScreen({ elements, pipeline, onSuccess }) {
  let capture = null; // { frames, startTime, endTime } while capturing

  pipeline.onFrame((frame) => {
    if (!capture) return;
    if (frame.t >= capture.startTime && frame.t <= capture.endTime) capture.frames.push(frame);
  });

  function reset() {
    capture = null;
    elements.countdown.textContent = "";
    elements.progress.value = 0;
    elements.startButton.disabled = false;
  }

  function start() {
    if (capture) return;
    const now = performance.now();
    capture = {
      frames: [],
      startTime: now + CALIBRATION_SETTLE_MS,
      endTime: now + CALIBRATION_SETTLE_MS + CALIBRATION_DURATION_MS,
    };
    elements.startButton.disabled = true;
    elements.status.textContent = "Hold still...";
    tick();
  }

  function tick() {
    if (!capture) return;
    const now = performance.now();
    const elapsed = Math.max(0, now - capture.startTime);
    elements.progress.value = Math.min(1, elapsed / CALIBRATION_DURATION_MS);
    const secondsLeft = Math.ceil((capture.endTime - Math.max(now, capture.startTime)) / 1000);
    elements.countdown.textContent = secondsLeft > 0 ? String(secondsLeft) : "";
    if (now < capture.endTime) {
      requestAnimationFrame(tick);
    } else {
      finish();
    }
  }

  function finish() {
    const outcome = computeCalibration(capture.frames);
    reset();
    if (!outcome.ok) {
      elements.status.textContent = `${outcome.reason} Make sure both hands are in view, then press Start to try again.`;
      return;
    }
    saveCalibration(outcome.calibration);
    elements.status.textContent = "Calibration saved.";
    onSuccess(outcome.calibration);
  }

  return { start, reset, get capturing() { return capture !== null; } };
}

// ---------- Keyboard grid step ----------

/**
 * Average position of one finger's tip over some frames (frames without that
 * hand are skipped). The caller says which finger; this never guesses it.
 * @returns {{point: {x, y, z}, samples: number} | null}
 */
export function averageFingertip(frames, finger) {
  const { side, index } = fingertipLocation(finger);
  const tips = frames.map((frame) => frame.hands.find((h) => h.side === side)?.landmarks[index]).filter(Boolean);
  return tips.length === 0 ? null : { point: averagePoint(tips), samples: tips.length };
}

/** Convert a click in an object-fit: contain video into normalized image coordinates. */
export function pointInVideoFrame(clientX, clientY, rect, videoWidth, videoHeight) {
  if (!rect?.width || !rect?.height || !videoWidth || !videoHeight) return null;
  const scale = Math.min(rect.width / videoWidth, rect.height / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  const left = rect.left + (rect.width - width) / 2;
  const top = rect.top + (rect.height - height) / 2;
  const x = (clientX - left) / width;
  const y = (clientY - top) / height;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}

/**
 * Run the keyboard grid step. Clicking a key in the video records its center;
 * pressing the physical key can still use the named fingertip when available.
 * @param {object} options
 * @param {object} options.elements  { prompt, steps: HTMLLIElement[] (one per corner), status }
 * @param {() => object|null} options.getHomeRow  the home row calibration, to check the fit
 * @param {(grid: object|null) => void} options.onGrid  null when placed discs need adjustment
 * @param {(touches: object|null) => void} [options.onProgress]
 */
export function createKeyboardGridCapture({ elements, getHomeRow, onGrid, onProgress = () => {} }) {
  let active = false;
  let touches = {};

  function render() {
    const nextCorner = GRID_CORNERS.find((corner) => !touches[corner.code]);
    GRID_CORNERS.forEach((corner, i) => {
      const done = Boolean(touches[corner.code]);
      const item = elements.steps[i];
      item.classList.toggle("done", done);
      item.classList.toggle("current", corner === nextCorner);
      item.querySelector(".step-mark").textContent = done ? "✓" : corner === nextCorner ? "→" : "";
    });
    elements.prompt.replaceChildren();
    if (nextCorner) {
      const key = document.createElement("kbd");
      key.textContent = nextCorner.label;
      elements.prompt.append("Place the ", key, " disc on its key.");
    } else {
      elements.prompt.textContent = "All four discs are placed. Move any disc to adjust it.";
    }
  }

  function start() {
    active = true;
    touches = {};
    onProgress(null);
    elements.status.textContent = "Drag Q, P, Z, and / onto the centers of those keys.";
    render();
  }

  function stop() {
    active = false;
    onProgress(null);
    render();
  }

  function handlePoint(code, point) {
    if (!active || !GRID_CORNERS.some((corner) => corner.code === code)) return;
    touches[code] = { x: point.x, y: point.y };
    onProgress({ ...touches });
    render();
    const missing = GRID_CORNERS.filter((corner) => !touches[corner.code]);
    if (missing.length) {
      const next = missing[0];
      elements.status.textContent = `Placed ${GRID_CORNERS.find((corner) => corner.code === code).label}. Next, drag ${next.label} onto its key.`;
      return;
    }

    const outcome = computeKeyboardGrid(touches, getHomeRow());
    if (!outcome.ok) {
      onGrid(null);
      elements.status.textContent = `${outcome.reason} Drag the discs to adjust their positions.`;
      return;
    }
    onGrid(outcome.grid);
  }

  return { start, stop, handlePoint, get running() { return active; } };
}
