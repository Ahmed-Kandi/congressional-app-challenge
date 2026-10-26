// Decide which detected hand is the user's left and which is the right.
//
// We do NOT trust MediaPipe's own "Left"/"Right" label: it is trained on
// selfie-style images, so with a camera looking down at a keyboard, or a
// mirrored image, it is often backwards. Instead we use where the hand is in
// the image, plus settings that describe how the camera sees the user.

/**
 * Does the user's left hand appear on the LEFT side of the image (small x)?
 *
 * - Camera above the keyboard looking down (top of image = far edge of the
 *   keyboard): you see the hands the way the user sees them, so left is left.
 * - Camera behind the keyboard looking at the user: like a person facing you,
 *   their left hand is on your right.
 * - A mirrored image swaps left and right once more.
 * - Rotating the image by 180 degrees swaps which side of the raw frame each
 *   hand occupies.
 *
 * If the camera above the keyboard is rotated so the image is upside down,
 * left/right also swap; the "mirrored" toggle fixes that case too.
 */
export function userLeftIsOnImageLeft({ mirrored, cameraFacing, rotated = false }) {
  const seesLikeUser = cameraFacing !== "behind";
  const leftIsImageLeft = mirrored ? !seesLikeUser : seesLikeUser;
  return rotated ? !leftIsImageLeft : leftIsImageLeft;
}

/** Average x of a hand's landmarks: its horizontal position in the image (0 = left edge, 1 = right). */
export function handCenterX(landmarks) {
  let sum = 0;
  for (const point of landmarks) sum += point.x;
  return sum / landmarks.length;
}

/**
 * Label raw detections with sides.
 * @param {Array<{landmarks: Array<{x,y,z}>, score: number}>} detections  MediaPipe hands, any order
 * @param {{mirrored: boolean, cameraFacing: "above"|"behind", rotated?: boolean}} settings
 * @returns {Array<{side: "L"|"R", landmarks, score}>}  left hand first
 */
export function assignSides(detections, settings) {
  const leftIsImageLeft = userLeftIsOnImageLeft(settings);
  const hands = detections.slice(0, 2).map((d) => ({ ...d, centerX: handCenterX(d.landmarks) }));

  if (hands.length === 0) return [];

  if (hands.length === 1) {
    // One hand: decide by which half of the image it is in.
    const onImageLeft = hands[0].centerX < 0.5;
    const side = onImageLeft === leftIsImageLeft ? "L" : "R";
    return [toLabeled(hands[0], side)];
  }

  // Two hands: whichever is further toward the user's-left side of the image is "L".
  const [imageLeftHand, imageRightHand] =
    hands[0].centerX <= hands[1].centerX ? hands : [hands[1], hands[0]];
  return leftIsImageLeft
    ? [toLabeled(imageLeftHand, "L"), toLabeled(imageRightHand, "R")]
    : [toLabeled(imageRightHand, "L"), toLabeled(imageLeftHand, "R")];
}

function toLabeled(hand, side) {
  return { side, landmarks: hand.landmarks, score: hand.score };
}
