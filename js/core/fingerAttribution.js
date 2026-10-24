// RESERVED FOR THE TEAM.

import { fingertipLocation } from "../landmarks.js";
export const ATTRIBUTION_IMPLEMENTED = false;
/**
 * Decide which finger pressed a key.
 * @param {{code: string, key: string, t: number}} keyEvent  t is performance.now() ms
 * @param {import('../frameBuffer.js').FrameBuffer} frames   frames.between(t0, t1)
 * @param {object|null} calibration   output of calibration.js, or null
 * @returns {{finger: string, confidence: number, debug?: object} | null}
 *   finger is one of the IDs in fingerMap.js. Return null if unsure.
 */
export function attributeKeystroke(keyEvent, frames, calibration) {
  const fingers = ["L_PINKY", "L_RING", "L_MIDDLE", "L_INDEX", "R_INDEX", "R_MIDDLE", "R_RING", "R_PINKY"];
  const nearbyFrames = frames.between(keyEvent.t - 100, keyEvent.t + 100);let best = null;
  let bestGap = Infinity;
  for (const frame of nearbyFrames) {
    const gap = Math.abs(frame.t - keyEvent.t);
    if (gap < bestGap) {
      bestGap = gap;
      best = frame;
    }
  }
  if (best == null) {return null;}

  const fingerDistances = [];
  for (const finger of fingers) {
    const { side, index } = fingertipLocation(finger);
    const hand = best.hands.find((h) => h.side === side);
    if (hand == null) {
      console.log(keyEvent.key, "hand missing");
      return null;
    }
    const tip = hand.landmarks[index];
    const restPos = calibration.baselines[finger];
    const dist = Math.hypot(tip.x - restPos.x, tip.y - restPos.y) / calibration.handSpan;
    fingerDistances.push(dist);
  }
  console.log(keyEvent.code, fingerDistances.join(" "));


  return null;
}
