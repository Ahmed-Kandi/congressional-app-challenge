// RESERVED FOR THE TEAM.

import { fingertipLocation } from "../landmarks.js";
import { CLEAR_WINNER_MARGIN_KEYS, HOME_LIMIT_HAND_SPANS, ON_KEY_LIMIT_KEYS } from "../config.js";
import {expectedFingers} from "../fingerMap.js";
import { KEY_LAYOUT, keyDistance } from "../keyboardGrid.js";

export const ATTRIBUTION_IMPLEMENTED = true;
const fingers = ["L_PINKY", "L_RING", "L_MIDDLE", "L_INDEX", "R_INDEX", "R_MIDDLE", "R_RING", "R_PINKY"];

/**
 * Decide which finger pressed a key.
 * @param {{code: string, key: string, t: number}} keyEvent  t is performance.now() ms
 * @param {import('../frameBuffer.js').FrameBuffer} frames   frames.between(t0, t1)
 * @param {object|null} calibration   output of calibration.js, or null
 * @returns {{finger: string, confidence: number, debug?: object} | null}
 *   finger is one of the IDs in fingerMap.js. Return null if unsure.
 */
export function attributeKeystroke(keyEvent, frames, calibration) {
  if (!calibration) return null;
  const homeKeys = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyJ", "KeyK", "KeyL", "Semicolon"]

  const nearbyFrames = frames.between(keyEvent.t - 100, keyEvent.t + 100);
  let best = null;
  let bestGap = Infinity;
  for (const frame of nearbyFrames) {
    const gap = Math.abs(frame.t - keyEvent.t);
    if (gap < bestGap) {
      bestGap = gap;
      best = frame;
    }
  }
  if (best == null) {return null;}
  if (!homeKeys.includes(keyEvent.code)) {return whoIsOnKey(keyEvent, best, calibration);}

  for (const finger of fingers) {
    const { side, index } = fingertipLocation(finger);
    const hand = best.hands.find((h) => h.side === side);
    if (hand == null) {return null;}
    const tip = hand.landmarks[index];
    const restPos = calibration.baselines[finger];
    const dist = Math.hypot(tip.x - restPos.x, tip.y - restPos.y) / calibration.handSpan;

    if (dist > HOME_LIMIT_HAND_SPANS) {return whoIsOnKey(keyEvent, best, calibration);}
  }
  return {finger: expectedFingers(keyEvent.code)[0], confidence: 0.8}
}

function whoIsOnKey(keyEvent, frame, calibration) {
  const grid = calibration.keyboardGrid;
  if (!grid) {return null;}
  if (expectedFingers(keyEvent.code).length !== 1) {return null;}
  const key = KEY_LAYOUT[keyEvent.code];
  if (!key || key.width > 1) {return null;}

  let nearest = null;
  let nearestDist = Infinity;
  let secondDist = Infinity;
  for (const finger of fingers) {
    const { side, index } = fingertipLocation(finger);
    const hand = frame.hands.find((h) => h.side === side);
    if (hand == null) {return null;}
    const dist = keyDistance(grid, hand.landmarks[index], keyEvent.code);
    if (dist < nearestDist) {
      secondDist = nearestDist;
      nearestDist = dist;
      nearest = finger;
    } else if (dist < secondDist) {
      secondDist = dist;
    }
  }

  if (nearestDist > ON_KEY_LIMIT_KEYS) {return null;}
  const margin = secondDist - nearestDist;
  if (margin < CLEAR_WINNER_MARGIN_KEYS) {return null;}
  const confidence = Math.min(0.95, 0.5 + margin / 2);
  return {finger: nearest, confidence: confidence}
}
