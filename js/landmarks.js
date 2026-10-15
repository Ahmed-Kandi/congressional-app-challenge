// MediaPipe hand landmark indices, in one place so no other file uses magic numbers.
// MediaPipe returns 21 points per hand: the wrist, then 4 joints per finger
// running from the knuckle out to the tip.
// Diagram: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker

export const LANDMARK_COUNT = 21;

export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_TIP = 8;
export const MIDDLE_TIP = 12;
export const RING_TIP = 16;
export const PINKY_TIP = 20;

// Fingertip index for each finger name (finger IDs drop the L_/R_ prefix here).
export const FINGERTIP_BY_FINGER_NAME = {
  THUMB: THUMB_TIP,
  INDEX: INDEX_TIP,
  MIDDLE: MIDDLE_TIP,
  RING: RING_TIP,
  PINKY: PINKY_TIP,
};

// Each finger is a chain of 4 landmarks; the first is the knuckle.
export const FINGER_CHAINS = {
  THUMB: [1, 2, 3, THUMB_TIP],
  INDEX: [5, 6, 7, INDEX_TIP],
  MIDDLE: [9, 10, 11, MIDDLE_TIP],
  RING: [13, 14, 15, RING_TIP],
  PINKY: [17, 18, 19, PINKY_TIP],
};

// Pairs of landmarks to connect with lines when drawing the hand skeleton.
export const HAND_CONNECTIONS = [
  ...Object.values(FINGER_CHAINS).flatMap((chain) => [
    [WRIST, chain[0]],
    [chain[0], chain[1]],
    [chain[1], chain[2]],
    [chain[2], chain[3]],
  ]),
  // Across the palm, knuckle to knuckle.
  [FINGER_CHAINS.INDEX[0], FINGER_CHAINS.MIDDLE[0]],
  [FINGER_CHAINS.MIDDLE[0], FINGER_CHAINS.RING[0]],
  [FINGER_CHAINS.RING[0], FINGER_CHAINS.PINKY[0]],
];

/**
 * Where to find a finger's tip: which hand side and which landmark.
 * "L_INDEX" -> { side: "L", index: 8 }. A plain table lookup.
 */
export function fingertipLocation(fingerId) {
  const [side, name] = fingerId.split("_");
  return { side, index: FINGERTIP_BY_FINGER_NAME[name] };
}
