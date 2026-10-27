import { FINGERTIP_BY_FINGER_NAME, fingertipLocation } from "./landmarks.js";
import { drawFingerStatusMark, FINGER_STATUS_COLORS } from "./overlay.js?v=site-fix-1";

/** Save only the fingertip positions needed to annotate a wrong-finger press. */
export function captureFingerMarks(frameBuffer, eventTime, usedFinger, expectedFingers) {
  const frame = frameBuffer.between(eventTime - 100, eventTime + 100)
    .reduce((closest, candidate) => !closest || Math.abs(candidate.t - eventTime) < Math.abs(closest.t - eventTime)
      ? candidate : closest, null);
  if (!frame) return null;
  const tip = (finger) => {
    const { side, index } = fingertipLocation(finger);
    const point = frame.hands.find((hand) => hand.side === side)?.landmarks?.[index];
    return Number.isFinite(point?.x) && Number.isFinite(point?.y)
      ? { x: point.x, y: point.y } : null;
  };
  const used = tip(usedFinger);
  const expected = expectedFingers.map(tip).filter(Boolean);
  return used || expected.length ? { used, expected } : null;
}

/** Keep a small, in-memory fingertip track aligned with the lesson video. */
export function compactReplayFrame(frame) {
  const tips = {};
  for (const hand of frame.hands) {
    if (hand.side !== "L" && hand.side !== "R") continue;
    for (const [finger, index] of Object.entries(FINGERTIP_BY_FINGER_NAME)) {
      const point = hand.landmarks?.[index];
      if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) {
        tips[`${hand.side}_${finger}`] = { x: point.x, y: point.y };
      }
    }
  }
  return { t: frame.t, tips };
}

/** Interpolate between nearby tracked frames so marks move with the filmed fingers. */
export function followingFingerMarks(frames, time, usedFinger, expectedFingers) {
  if (!frames.length) return null;
  let low = 0;
  let high = frames.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (frames[middle].t < time) low = middle + 1;
    else high = middle;
  }
  const before = frames[low - 1] ?? null;
  const after = frames[low] ?? null;
  const nearbyBefore = before && time - before.t <= 120 ? before : null;
  const nearbyAfter = after && after.t - time <= 120 ? after : null;
  if (!nearbyBefore && !nearbyAfter) return null;
  const pointFor = (finger) => {
    const first = nearbyBefore?.tips[finger];
    const second = nearbyAfter?.tips[finger];
    if (first && second && nearbyAfter.t > nearbyBefore.t) {
      const fraction = Math.max(0, Math.min(1, (time - nearbyBefore.t) / (nearbyAfter.t - nearbyBefore.t)));
      return { x: first.x + (second.x - first.x) * fraction, y: first.y + (second.y - first.y) * fraction };
    }
    return first ?? second ?? null;
  };
  const used = pointFor(usedFinger);
  const expected = expectedFingers.map(pointFor).filter(Boolean);
  return used || expected.length ? { used, expected } : null;
}

/** Keep feedback upright while mapping fingertip positions onto the rotated video. */
export function displayReplayPoint(point, width, height, rotated = false, flipped = false) {
  const turned = Boolean(rotated) !== Boolean(flipped);
  return { x: (turned ? 1 - point.x : point.x) * width, y: (turned ? 1 - point.y : point.y) * height };
}

/** Use exactly the same outlined circles and check/X badges as the live camera. */
export function drawReplayMarks(canvas, marks, { rotated = false, flipped = false } = {}) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!marks) return;
  const outward = Boolean(rotated) !== Boolean(flipped) ? 1 : -1;
  const toCanvas = (point) => displayReplayPoint(point, canvas.width, canvas.height, rotated, flipped);
  marks.expected.forEach((point) =>
    drawFingerStatusMark(ctx, toCanvas(point), FINGER_STATUS_COLORS.correct, "✓", true, outward));
  const usedTip = marks.used ? toCanvas(marks.used) : null;
  if (usedTip) {
    drawFingerStatusMark(ctx, usedTip, FINGER_STATUS_COLORS.wrong, "✗", false, outward);
  }
}
