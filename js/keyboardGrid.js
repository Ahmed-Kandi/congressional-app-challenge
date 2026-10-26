// Keyboard grid: where each key sits in the camera image.
//
// The student presses four corner keys (Q, P, Z, /) with an index finger. We
// know where those keys are on a real keyboard and see where the fingertip was
// in the image, so we can fit a perspective mapping ("homography") from
// keyboard coordinates to image coordinates. Four points are exactly enough
// for that, and it stays correct when the camera looks at the keyboard at an
// angle (rows further away look smaller and closer together).
//
// This is a measuring tool only. It answers "where is this key in the image?",
// never "which finger pressed it". That decision is the team's job.

import { KEYBOARD_GRID_MAX_HOME_ROW_ERROR_KEYS, KEYBOARD_GRID_MIN_AREA } from "./config.js";

// Key centers on a standard US (ANSI) keyboard, in key widths.
// col: from the left edge of the keyboard. row: 0 = number row, 1 = Q row,
// 2 = home row, 3 = Z row, 4 = space bar row. width: how wide the key is.
// Laptop keyboards (including MacBooks) use the same stagger for these keys.
function row(rowIndex, firstCenter, codes) {
  return codes.map((code, i) => [code, { col: firstCenter + i, row: rowIndex, width: 1 }]);
}

export const KEY_LAYOUT = Object.fromEntries([
  ...row(0, 0.5, ["Backquote", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6",
    "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"]),
  ["Backspace", { col: 14, row: 0, width: 2 }],
  ["Tab", { col: 0.75, row: 1, width: 1.5 }],
  ...row(1, 2, ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP",
    "BracketLeft", "BracketRight"]),
  ["Backslash", { col: 14.25, row: 1, width: 1.5 }],
  ["CapsLock", { col: 0.875, row: 2, width: 1.75 }],
  ...row(2, 2.25, ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL",
    "Semicolon", "Quote"]),
  ["Enter", { col: 13.875, row: 2, width: 2.25 }],
  ["ShiftLeft", { col: 1.125, row: 3, width: 2.25 }],
  ...row(3, 2.75, ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"]),
  ["ShiftRight", { col: 13.625, row: 3, width: 2.75 }],
  // The space bar is about 6 keys wide, so its center says little about where
  // a thumb lands on it. Use `width` if that matters.
  ["Space", { col: 6.875, row: 4, width: 6.25 }],
]);

// The four keys the student presses, and which index finger to use.
// Index fingers because MediaPipe tracks them best.
export const GRID_CORNERS = [
  { code: "KeyQ", label: "Q", finger: "L_INDEX" },
  { code: "KeyP", label: "P", finger: "R_INDEX" },
  { code: "KeyZ", label: "Z", finger: "L_INDEX" },
  { code: "Slash", label: "/", finger: "R_INDEX" },
];

const HOME_ROW_FINGERS = {
  L_PINKY: "KeyA", L_RING: "KeyS", L_MIDDLE: "KeyD", L_INDEX: "KeyF",
  R_INDEX: "KeyJ", R_MIDDLE: "KeyK", R_RING: "KeyL", R_PINKY: "Semicolon",
};

/** Short text for drawing a key: "KeyQ" -> "Q", "Digit1" -> "1", "Semicolon" -> ";". */
export function keyLabel(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  const symbols = {
    Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
    Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
  };
  return symbols[code] ?? code;
}

// ---- The math ----

/**
 * Solve a small square linear system A x = b by Gaussian elimination with
 * partial pivoting. Returns null if the system has no single answer.
 */
export function solveLinearSystem(A, b) {
  const n = b.length;
  const m = A.map((rowValues, i) => [...rowValues, b[i]]);
  for (let col = 0; col < n; col += 1) {
    // Pick the row with the largest value in this column to keep rounding errors small.
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = m[r][col] / m[col][col];
      for (let c = col; c <= n; c += 1) m[r][c] -= factor * m[col][c];
    }
  }
  return m.map((rowValues, i) => rowValues[n] / rowValues[i]);
}

/**
 * Fit the homography that maps 4 source points onto 4 destination points.
 * Returns 9 numbers [h0..h8] (h8 = 1), or null if the points are degenerate.
 * A point (u, v) maps to ((h0 u + h1 v + h2) / w, (h3 u + h4 v + h5) / w)
 * with w = h6 u + h7 v + 1.
 */
export function fitHomography(source, destination) {
  const A = [];
  const b = [];
  source.forEach(({ x: u, y: v }, i) => {
    const { x, y } = destination[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  });
  const h = solveLinearSystem(A, b);
  return h ? [...h, 1] : null;
}

export function applyHomography(h, { x: u, y: v }) {
  const w = h[6] * u + h[7] * v + h[8];
  return { x: (h[0] * u + h[1] * v + h[2]) / w, y: (h[3] * u + h[4] * v + h[5]) / w };
}

/** The reverse mapping (image -> keyboard), as another 9-number homography. */
export function invertHomography(h) {
  const [a, b, c, d, e, f, g, i, j] = h;
  const det = a * (e * j - f * i) - b * (d * j - f * g) + c * (d * i - e * g);
  if (Math.abs(det) < 1e-15) return null;
  const inverse = [
    e * j - f * i, c * i - b * j, b * f - c * e,
    f * g - d * j, a * j - c * g, c * d - a * f,
    d * i - e * g, b * g - a * i, a * e - b * d,
  ].map((value) => value / det);
  return inverse.map((value) => value / inverse[8]);
}

/** Signed area of a polygon (shoelace formula). The sign tells which way it winds. */
function signedArea(points) {
  let sum = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length];
    sum += p.x * q.y - q.x * p.y;
  });
  return sum / 2;
}

/** True if the 4 points, in order, form a convex shape (no crossing, no dent). */
function isConvexQuad(points) {
  const turns = points.map((p, i) => {
    const q = points[(i + 1) % 4];
    const r = points[(i + 2) % 4];
    return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
  });
  return turns.every((t) => t > 0) || turns.every((t) => t < 0);
}

// ---- Building and using a grid ----

/**
 * Build a keyboard grid from where the fingertip was on each corner key.
 * @param {{[code: string]: {x: number, y: number}}} touches  image points for KeyQ, KeyP, KeyZ, Slash
 * @param {object|null} homeRowCalibration  output of computeCalibration, used only to check the fit
 * @returns {{ok: true, grid: object} | {ok: false, reason: string}}
 */
export function computeKeyboardGrid(touches, homeRowCalibration = null, createdAt = new Date().toISOString()) {
  const missing = GRID_CORNERS.filter(({ code }) => !touches[code]);
  if (missing.length > 0) {
    return { ok: false, reason: `Missing ${missing.map((c) => c.label).join(", ")}.` };
  }
  // Walk the corners around the outside: Q, P, /, Z.
  const around = ["KeyQ", "KeyP", "Slash", "KeyZ"].map((code) => touches[code]);
  if (!isConvexQuad(around) || Math.abs(signedArea(around)) < KEYBOARD_GRID_MIN_AREA) {
    return {
      ok: false,
      reason: "The four key positions do not form a keyboard shape. Check you pressed Q, P, Z and / with the finger shown.",
    };
  }
  const keyboardPoints = GRID_CORNERS.map(({ code }) => ({ x: KEY_LAYOUT[code].col, y: KEY_LAYOUT[code].row }));
  const imagePoints = GRID_CORNERS.map(({ code }) => touches[code]);
  const homography = fitHomography(keyboardPoints, imagePoints);
  if (!homography) return { ok: false, reason: "Could not fit a grid to those points. Try again." };

  const grid = {
    createdAt,
    touches: Object.fromEntries(GRID_CORNERS.map(({ code }) => [code, { x: touches[code].x, y: touches[code].y }])),
    homography,
    homeRowErrorKeys: null,
    homeRowWarning: null,
  };

  // Check the grid against the home row calibration: the fingers rested on
  // known keys, so their tips should land near those keys' centers.
  if (homeRowCalibration?.baselines) {
    const errors = Object.entries(HOME_ROW_FINGERS).map(([finger, code]) =>
      keyDistance(grid, homeRowCalibration.baselines[finger], code),
    );
    grid.homeRowErrorKeys = errors.reduce((sum, e) => sum + e, 0) / errors.length;
    if (grid.homeRowErrorKeys > KEYBOARD_GRID_MAX_HOME_ROW_ERROR_KEYS) {
      grid.homeRowWarning = `The home row estimate is ${grid.homeRowErrorKeys.toFixed(1)} keys away. ` +
        "Check the dots against the real keys before continuing.";
    }
  }
  return { ok: true, grid };
}

/** Image position (same units as landmarks) of a point given in keyboard units. */
export function keyboardToImage(grid, col, rowIndex) {
  return applyHomography(grid.homography, { x: col, y: rowIndex });
}

/** Keyboard position (col, row in key widths) of a point in the image. */
export function imageToKeyboard(grid, point) {
  const inverse = invertHomography(grid.homography);
  if (!inverse) return null;
  const { x, y } = applyHomography(inverse, point);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { col: x, row: y };
}

/** The key directly under a fingertip's 2D image position, or null off keys. */
export function hoveredKey(grid, point) {
  if (!grid?.homography || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const position = imageToKeyboard(grid, point);
  if (!position) return null;
  let nearest = null;
  for (const [code, key] of Object.entries(KEY_LAYOUT)) {
    const dx = Math.abs(position.col - key.col);
    const dy = Math.abs(position.row - key.row);
    if (dx > key.width / 2 + 0.08 || dy > 0.48) continue;
    const distance = Math.hypot(dx / Math.max(1, key.width), dy);
    if (!nearest || distance < nearest.distance) nearest = { code, label: keyLabel(code), distance };
  }
  return nearest;
}

/** Where a key's center is in the image, or null for keys not in KEY_LAYOUT. */
export function keyCenterInImage(grid, code) {
  const key = KEY_LAYOUT[code];
  return key ? keyboardToImage(grid, key.col, key.row) : null;
}

/**
 * How far an image point is from a key's center, measured in key widths on
 * the keyboard (so the answer does not depend on camera distance or angle).
 * Returns null for keys not in KEY_LAYOUT.
 */
export function keyDistance(grid, point, code) {
  const key = KEY_LAYOUT[code];
  const onKeyboard = key ? imageToKeyboard(grid, point) : null;
  if (!onKeyboard) return null;
  return Math.hypot(onKeyboard.col - key.col, onKeyboard.row - key.row);
}

/** How wide one key looks in the image at that key (perspective makes far keys smaller). */
export function keyWidthInImage(grid, code) {
  const key = KEY_LAYOUT[code];
  if (!key) return null;
  const left = keyboardToImage(grid, key.col - 0.5, key.row);
  const right = keyboardToImage(grid, key.col + 0.5, key.row);
  return Math.hypot(right.x - left.x, right.y - left.y);
}
