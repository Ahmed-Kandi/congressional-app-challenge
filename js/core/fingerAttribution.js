// Estimate the pressing finger from observed motion, then use the camera's
// keyboard map to confirm which fingertip was nearest the pressed key.

import { ATTRIBUTION_DELAY_MS, CLEAR_WINNER_MARGIN_KEYS, ON_KEY_LIMIT_KEYS } from "../config.js";
import { FINGERS } from "../fingerMap.js";
import { KEY_LAYOUT, keyDistance } from "../keyboardGrid.js";
import { FINGER_CHAINS, fingertipLocation } from "../landmarks.js";

export const ATTRIBUTION_IMPLEMENTED = true;

const NON_THUMB_FINGERS = FINGERS.filter((finger) => !finger.endsWith("THUMB"));

// Relative tip-to-knuckle motion removes most whole-hand and camera movement.
function relativeTip(frame, fingerId) {
  const [side, name] = fingerId.split("_");
  const hand = frame.hands?.find((item) => item.side === side);
  const chain = FINGER_CHAINS[name];
  if (!hand || !chain || hand.landmarks?.length !== 21) return null;
  const tip = hand.landmarks[chain[3]];
  const knuckle = hand.landmarks[chain[0]];
  if (![tip?.x, tip?.y, tip?.z, knuckle?.x, knuckle?.y, knuckle?.z].every(Number.isFinite)) return null;
  return { x: tip.x - knuckle.x, y: tip.y - knuckle.y, z: tip.z - knuckle.z };
}

function average(points) {
  if (!points.length) return null;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    z: points.reduce((sum, point) => sum + point.z, 0) / points.length,
  };
}

function movement(point, baseline) {
  return Math.hypot(point.x - baseline.x, point.y - baseline.y, (point.z - baseline.z) * 0.7);
}

function motionEstimate(keyEvent, frames, calibration) {
  const t = keyEvent.t;
  const baselineFrames = frames.between(t - 230, t - 100);
  const pressFrames = frames.between(t - 40, t + ATTRIBUTION_DELAY_MS);
  if (!baselineFrames.length || !pressFrames.length) return null;

  const candidates = [];
  for (const finger of FINGERS) {
    const baseline = average(baselineFrames.map((frame) => relativeTip(frame, finger)).filter(Boolean));
    if (!baseline) continue;
    const motions = pressFrames
      .map((frame) => {
        const relative = relativeTip(frame, finger);
        const [side, name] = finger.split("_");
        const hand = frame.hands?.find((item) => item.side === side);
        const tip = hand?.landmarks?.[FINGER_CHAINS[name][3]];
        return relative && tip ? { score: movement(relative, baseline), tip } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    if (!motions.length) continue;
    const strongest = motions.slice(0, 2);
    let score = strongest.reduce((sum, value) => sum + value.score, 0) / strongest.length;
    // A finger moving nowhere near the key should not win merely by moving more.
    if (calibration?.keyboardGrid) {
      const distances = strongest
        .map(({ tip }) => keyDistance(calibration.keyboardGrid, tip, keyEvent.code))
        .filter(Number.isFinite);
      if (distances.length) {
        const distance = Math.min(...distances);
        if (distance > 2.5) continue;
        score *= 1 - 0.2 * distance / 2.5;
      }
    }
    candidates.push({ finger, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 0.012) return null;
  const second = candidates[1]?.score ?? 0;
  const separation = Math.max(0, (best.score - second) / best.score);
  const strength = Math.min(1, (best.score - 0.009) / 0.025);
  const confidence = Math.max(0, Math.min(1, 0.15 + 0.5 * strength + 0.35 * separation));
  if (confidence < 0.5) return null;
  return { finger: best.finger, confidence, debug: { motion: best.score, runnerUp: second } };
}

// The newer camera logic identifies a finger by its distance from the mapped
// key at keydown time. It is corroborating evidence: still hands alone are
// never enough to claim a finger pressed a key.
function positionEstimate(keyEvent, frames, calibration) {
  const grid = calibration?.keyboardGrid;
  const key = KEY_LAYOUT[keyEvent.code];
  if (!grid || !key || key.width > 1) return null;
  const nearby = frames.between(keyEvent.t - 100, keyEvent.t + 100);
  let closestFrame = null;
  for (const frame of nearby) {
    if (!closestFrame || Math.abs(frame.t - keyEvent.t) < Math.abs(closestFrame.t - keyEvent.t)) closestFrame = frame;
  }
  if (!closestFrame) return null;

  let winner = null;
  let nearest = Infinity;
  let second = Infinity;
  for (const finger of NON_THUMB_FINGERS) {
    const { side, index } = fingertipLocation(finger);
    const hand = closestFrame.hands?.find((item) => item.side === side);
    const tip = hand?.landmarks?.[index];
    if (!tip) continue;
    const distance = keyDistance(grid, tip, keyEvent.code);
    if (!Number.isFinite(distance)) continue;
    if (distance < nearest) {
      second = nearest;
      nearest = distance;
      winner = finger;
    } else if (distance < second) {
      second = distance;
    }
  }
  const margin = second - nearest;
  if (!winner || nearest > ON_KEY_LIMIT_KEYS || margin < CLEAR_WINNER_MARGIN_KEYS) return null;
  return { finger: winner, confidence: Math.min(0.95, 0.5 + margin / 2), distance: nearest, margin };
}

/**
 * Decide which finger pressed a key. Return null rather than guessing when
 * the hand movement or mapped position is ambiguous.
 */
export function attributeKeystroke(keyEvent, frames, calibration) {
  if (!Number.isFinite(keyEvent?.t) || !frames?.between) return null;
  const motion = motionEstimate(keyEvent, frames, calibration);
  if (!motion) return null;
  const position = positionEstimate(keyEvent, frames, calibration);
  if (!position) return motion;
  // A single nearest frame can lag behind the key event. When it disagrees
  // with the movement across several frames, keep the movement estimate.
  if (position.finger !== motion.finger) {
    return { ...motion, debug: { ...motion.debug, keyConflict: position.finger } };
  }
  return {
    finger: motion.finger,
    confidence: Math.max(motion.confidence, position.confidence),
    debug: { ...motion.debug, keyDistance: position.distance, keyMargin: position.margin },
  };
}
