// RESERVED FOR THE TEAM.
// See TEAM_NOTES.md section "Your part: finger attribution".

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
  return null;
}
