// Motion traces: for a keystroke, plot every fingertip's x, y and z from
// 300 ms before to 300 ms after the key event, one line per finger.
//
// This is a measuring tool for the team. It shows raw motion so they can see
// which signal marks a key press with their camera angle. It does not decide
// which finger pressed anything. The thick line is the finger the KEY expects
// (from fingerMap.js), drawn thicker only so it is easy to find.

import { TRACE_HISTORY_LIMIT, TRACE_WINDOW_AFTER_MS, TRACE_WINDOW_BEFORE_MS } from "../config.js";
import { FINGERS, expectedFingers, fingerLabel } from "../fingerMap.js";
import { fingertipLocation } from "../landmarks.js";

export const AXES = [
  { id: "x", title: "x: across the image (0 = left edge, 1 = right edge)" },
  { id: "y", title: "y: down the image (0 = top edge, 1 = bottom edge)" },
  { id: "z", title: "z: depth from MediaPipe (more negative = closer to the camera)" },
];

// One color per finger, plus a dash pattern per hand so lines do not rely on color alone.
export const FINGER_COLORS = {
  L_PINKY: "#1f77b4",
  L_RING: "#17becf",
  L_MIDDLE: "#2ca02c",
  L_INDEX: "#9467bd",
  L_THUMB: "#7f7f7f",
  R_THUMB: "#bcbd22",
  R_INDEX: "#d62728",
  R_MIDDLE: "#ff7f0e",
  R_RING: "#e377c2",
  R_PINKY: "#8c564b",
};
const RIGHT_HAND_DASH = [7, 4];

/**
 * Turn a snapshot of frames into plot-ready lines.
 * @param {{keyEvent: {t: number}, frames: Array}} snapshot
 * @param {{relative: boolean}} options  relative: subtract each line's first value
 * @returns {{[finger: string]: {[axis: string]: Array<{dt: number, value: number}|null>}}}
 *   null entries mark frames where that hand was missing (a gap in the line)
 */
export function traceSeries(snapshot, { relative }) {
  const series = {};
  for (const finger of FINGERS) {
    const { side, index } = fingertipLocation(finger);
    series[finger] = {};
    for (const { id: axis } of AXES) {
      let first = null;
      series[finger][axis] = snapshot.frames.map((frame) => {
        const hand = frame.hands.find((h) => h.side === side);
        if (!hand) return null;
        const raw = hand.landmarks[index][axis];
        first ??= raw;
        return { dt: frame.t - snapshot.keyEvent.t, value: relative ? raw - first : raw };
      });
    }
  }
  return series;
}

/**
 * Keeps snapshots of the frames around recent keystrokes. A snapshot is taken
 * TRACE_WINDOW_AFTER_MS after the key, once the "after" frames exist.
 */
export function createTraceStore({ pipeline, frameBuffer, onChange }) {
  const snapshots = [];
  let nextId = 1;

  pipeline.onKey((keyEvent) => {
    setTimeout(() => {
      snapshots.push({
        id: nextId++,
        keyEvent,
        expected: expectedFingers(keyEvent.code),
        frames: frameBuffer.between(keyEvent.t - TRACE_WINDOW_BEFORE_MS, keyEvent.t + TRACE_WINDOW_AFTER_MS),
      });
      if (snapshots.length > TRACE_HISTORY_LIMIT) snapshots.shift();
      onChange(snapshots);
    }, TRACE_WINDOW_AFTER_MS + 30);
  });

  return { snapshots };
}

/** Pick readable axis limits, never squashing tiny motions into a flat line. */
function valueRange(lines) {
  let min = Infinity;
  let max = -Infinity;
  for (const line of lines) {
    for (const point of line) {
      if (!point) continue;
      min = Math.min(min, point.value);
      max = Math.max(max, point.value);
    }
  }
  if (min === Infinity) return { min: -0.01, max: 0.01 };
  const minimumSpan = 0.01;
  if (max - min < minimumSpan) {
    const middle = (max + min) / 2;
    return { min: middle - minimumSpan / 2, max: middle + minimumSpan / 2 };
  }
  const pad = (max - min) * 0.08;
  return { min: min - pad, max: max + pad };
}

/**
 * Draw three stacked plots (x, y, z) on a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {object|null} snapshot
 * @param {{relative: boolean}} options
 */
export function drawTraces(canvas, snapshot, { relative }) {
  const ctx = canvas.getContext("2d");
  const styles = getComputedStyle(canvas);
  const textColor = styles.color || "#000";
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillStyle = textColor;

  if (!snapshot) {
    ctx.fillText("Press a key while the camera sees your hands to see its motion traces here.", 16, 30);
    return;
  }

  const series = traceSeries(snapshot, { relative });
  const panelHeight = height / AXES.length;
  const margin = { left: 70, right: 16, top: 26, bottom: 34 };
  const plotWidth = width - margin.left - margin.right;
  const timeToX = (dt) => margin.left + ((dt + TRACE_WINDOW_BEFORE_MS) / (TRACE_WINDOW_BEFORE_MS + TRACE_WINDOW_AFTER_MS)) * plotWidth;

  AXES.forEach((axis, panelIndex) => {
    const top = panelIndex * panelHeight + margin.top;
    const plotHeight = panelHeight - margin.top - margin.bottom;
    const lines = FINGERS.map((finger) => series[finger][axis.id]);
    const range = valueRange(lines);
    const valueToY = (value) => top + plotHeight - ((value - range.min) / (range.max - range.min)) * plotHeight;

    // Title and frame.
    ctx.fillStyle = textColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.fillText(relative ? `${axis.title}, change from start` : axis.title, margin.left, top - 8);
    ctx.font = "12px system-ui, sans-serif";
    ctx.strokeStyle = textColor;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.strokeRect(margin.left, top, plotWidth, plotHeight);

    // Value ticks (3) and time ticks (every 100 ms).
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const fraction of [0, 0.5, 1]) {
      const value = range.min + fraction * (range.max - range.min);
      ctx.globalAlpha = 1;
      ctx.fillText(value.toFixed(3), margin.left - 6, valueToY(value));
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let dt = -TRACE_WINDOW_BEFORE_MS; dt <= TRACE_WINDOW_AFTER_MS; dt += 100) {
      ctx.globalAlpha = 1;
      ctx.fillText(`${dt}`, timeToX(dt), top + plotHeight + 4);
    }
    if (panelIndex === AXES.length - 1) {
      ctx.fillText("milliseconds from the key event", margin.left + plotWidth / 2, top + plotHeight + 19);
    }
    ctx.globalAlpha = 1;

    // The key event: a dashed vertical line at 0 ms.
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = textColor;
    ctx.beginPath();
    ctx.moveTo(timeToX(0), top);
    ctx.lineTo(timeToX(0), top + plotHeight);
    ctx.stroke();
    ctx.restore();
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("key", timeToX(0) + 4, top + 2);

    // One line per finger. Expected finger(s) drawn last and thicker.
    const order = [...FINGERS].sort((a, b) => Number(snapshot.expected.includes(a)) - Number(snapshot.expected.includes(b)));
    for (const finger of order) {
      const points = series[finger][axis.id];
      ctx.save();
      ctx.strokeStyle = FINGER_COLORS[finger];
      ctx.lineWidth = snapshot.expected.includes(finger) ? 4 : 1.5;
      if (finger.startsWith("R_")) ctx.setLineDash(RIGHT_HAND_DASH);
      ctx.beginPath();
      let penDown = false;
      for (const point of points) {
        if (!point) {
          penDown = false; // hand missing in this frame: leave a gap
          continue;
        }
        const x = timeToX(point.dt);
        const y = valueToY(point.value);
        if (penDown) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        penDown = true;
      }
      ctx.stroke();
      ctx.restore();
    }
  });
}

/** Build the legend once: a swatch and name per finger. */
export function renderLegend(container) {
  container.replaceChildren(
    ...FINGERS.map((finger) => {
      const item = document.createElement("span");
      item.style.setProperty(
        "--swatch",
        finger.startsWith("R_")
          ? `repeating-linear-gradient(90deg, ${FINGER_COLORS[finger]} 0 7px, transparent 7px 11px)`
          : FINGER_COLORS[finger],
      );
      item.textContent = `${fingerLabel(finger)}${finger.startsWith("R_") ? " (dashed)" : ""}`;
      return item;
    }),
  );
}

/** Text for the keystroke picker. */
export function describeSnapshot(snapshot) {
  const { keyEvent, expected, frames } = snapshot;
  const keyName = keyEvent.key === " " ? "Space" : keyEvent.key;
  const expectedText = expected.length ? expected.map(fingerLabel).join(" or ") : "no mapped finger";
  return `#${snapshot.id}: "${keyName}" (${keyEvent.code}), expected ${expectedText}, ${frames.length} frames`;
}
