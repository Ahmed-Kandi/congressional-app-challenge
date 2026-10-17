// Synthetic hand data for tests: fake frames that look like MediaPipe output
// for two hands resting on the home row, with a chosen finger pressing a key.
//
// The generator is told which finger to move and moves it. It never looks at
// the data to work out which finger moved; that is the team's job.
//
// Coordinates imitate a camera ABOVE the keyboard looking down, not mirrored:
// x grows to the right, y grows toward the user, z is MediaPipe's relative
// depth (more negative = closer to the camera).

import { FINGER_CHAINS, LANDMARK_COUNT, WRIST } from "../js/landmarks.js";

// Where each fingertip rests (keys are about 0.06 of the image width apart).
const REST_TIPS = {
  L_PINKY: { x: 0.2, y: 0.55, z: -0.03 },
  L_RING: { x: 0.26, y: 0.53, z: -0.035 },
  L_MIDDLE: { x: 0.32, y: 0.52, z: -0.04 },
  L_INDEX: { x: 0.38, y: 0.53, z: -0.035 },
  L_THUMB: { x: 0.45, y: 0.7, z: -0.02 },
  R_THUMB: { x: 0.51, y: 0.7, z: -0.02 },
  R_INDEX: { x: 0.56, y: 0.53, z: -0.035 },
  R_MIDDLE: { x: 0.62, y: 0.52, z: -0.04 },
  R_RING: { x: 0.68, y: 0.53, z: -0.035 },
  R_PINKY: { x: 0.74, y: 0.55, z: -0.03 },
};
const REST_WRISTS = {
  L: { x: 0.32, y: 0.85, z: 0 },
  R: { x: 0.65, y: 0.85, z: 0 },
};

// How far along the wrist->tip line each of a finger's 4 joints sits.
const JOINT_FRACTIONS = { THUMB: [0.25, 0.5, 0.75, 1], OTHER: [0.45, 0.65, 0.82, 1] };
// How much of the fingertip's press movement each joint shares (knuckle barely moves).
const JOINT_PRESS_SHARE = [0.05, 0.3, 0.6, 1];

// The home row key each finger presses in tests.
export const HOME_KEY_FOR_FINGER = {
  L_PINKY: { code: "KeyA", key: "a" },
  L_RING: { code: "KeyS", key: "s" },
  L_MIDDLE: { code: "KeyD", key: "d" },
  L_INDEX: { code: "KeyF", key: "f" },
  L_THUMB: { code: "Space", key: " " },
  R_THUMB: { code: "Space", key: " " },
  R_INDEX: { code: "KeyJ", key: "j" },
  R_MIDDLE: { code: "KeyK", key: "k" },
  R_RING: { code: "KeyL", key: "l" },
  R_PINKY: { code: "Semicolon", key: ";" },
};

export const DEFAULTS = {
  fps: 30,
  startTime: 1000, // ms, first frame time
  durationMs: 1000,
  noise: 0.002, // standard deviation of gaussian noise on every coordinate
  seed: 1,
  frameLagMs: 0, // frames are stamped this much later than what they show
  missingHands: [], // e.g. ["L"] to drop the left hand from every frame
  presses: [], // [{ finger: "L_INDEX", t: 1500, amplitude: 1 }]; a key event fires at t
  silentPresses: [], // same shape, but no key event (another finger moving at the same time)
  pressVector: { x: 0, y: 0.025, z: 0.03 }, // fingertip movement at full press
  downMs: 80, // finger travels to the key over this long, key fires at the bottom
  upMs: 120, // and returns over this long
};

/** Small seeded random number generator (mulberry32) so tests are repeatable. */
function makeRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gaussian noise with the Box-Muller method. */
function makeGaussian(random) {
  return function gaussian(sd) {
    if (sd === 0) return 0;
    const u = 1 - random();
    const v = random();
    return sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

/**
 * How far into a press the finger is at time `now`: 0 at rest, 1 at the bottom.
 * Smooth in and out so it looks like a real finger, not a jump.
 */
export function pressDepth(now, keyTime, downMs, upMs) {
  const smooth = (u) => u * u * (3 - 2 * u);
  if (now <= keyTime - downMs || now >= keyTime + upMs) return 0;
  if (now <= keyTime) return smooth((now - (keyTime - downMs)) / downMs);
  return smooth(1 - (now - keyTime) / upMs);
}

function lerp(a, b, f) {
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
}

/** Build the 21 resting landmarks for one hand. */
export function restingHand(side) {
  const points = new Array(LANDMARK_COUNT);
  const wrist = REST_WRISTS[side];
  points[WRIST] = { ...wrist };
  for (const [name, chain] of Object.entries(FINGER_CHAINS)) {
    const tip = REST_TIPS[`${side}_${name}`];
    const fractions = name === "THUMB" ? JOINT_FRACTIONS.THUMB : JOINT_FRACTIONS.OTHER;
    chain.forEach((landmarkIndex, j) => {
      points[landmarkIndex] = lerp(wrist, tip, fractions[j]);
    });
  }
  return points;
}

/**
 * Generate frames and key events.
 * @param {Partial<typeof DEFAULTS>} options
 * @returns {{frames: Array, keyEvents: Array<{code, key, t}>}}
 */
export function generateSynthetic(options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const gaussian = makeGaussian(makeRandom(opts.seed));
  const frameInterval = 1000 / opts.fps;
  // Multiply before dividing: 1000 / (1000 / 30) is 29.999... in floating point.
  const frameCount = Math.floor((opts.durationMs * opts.fps) / 1000 + 1e-9) + 1;
  const allMovements = [...opts.presses, ...opts.silentPresses];

  const frames = [];
  for (let i = 0; i < frameCount; i += 1) {
    const t = opts.startTime + i * frameInterval;
    // A lagging frame shows the hands as they were frameLagMs before its timestamp.
    const shownTime = t - opts.frameLagMs;
    const hands = [];
    for (const side of ["L", "R"]) {
      if (opts.missingHands.includes(side)) continue;
      const points = restingHand(side);
      for (const movement of allMovements) {
        if (!movement.finger.startsWith(side)) continue;
        const depth = pressDepth(shownTime, movement.t, opts.downMs, opts.upMs) * (movement.amplitude ?? 1);
        if (depth === 0) continue;
        const chain = FINGER_CHAINS[movement.finger.split("_")[1]];
        chain.forEach((landmarkIndex, j) => {
          const share = JOINT_PRESS_SHARE[j] * depth;
          const p = points[landmarkIndex];
          points[landmarkIndex] = {
            x: p.x + opts.pressVector.x * share,
            y: p.y + opts.pressVector.y * share,
            z: p.z + opts.pressVector.z * share,
          };
        });
      }
      const noisy = points.map((p) => ({
        x: p.x + gaussian(opts.noise),
        y: p.y + gaussian(opts.noise),
        z: p.z + gaussian(opts.noise),
      }));
      hands.push({ side, landmarks: noisy, score: 0.95 });
    }
    frames.push({ t, hands });
  }

  const keyEvents = opts.presses
    .map((press) => ({ ...HOME_KEY_FOR_FINGER[press.finger], t: press.t }))
    .sort((a, b) => a.t - b.t);

  return { frames, keyEvents };
}
