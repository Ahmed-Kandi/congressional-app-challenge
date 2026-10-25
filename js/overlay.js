// Draws the hand skeleton on a canvas laid exactly over the video, and
// flashes a fingertip green (right finger) or red (wrong finger; orange for
// the wrong hand), with a dashed check on the finger that should have pressed.
// Colors are never the only signal: flashes also draw a check or a cross.

import { FLASH_DURATION_MS, MISTAKE_FLASH_DURATION_MS } from "./config.js";
import { KEY_LAYOUT, keyCenterInImage, keyLabel } from "./keyboardGrid.js";
import {
  FINGERTIP_BY_FINGER_NAME,
  HAND_CONNECTIONS,
  LANDMARK_COUNT,
  WRIST,
  fingertipLocation,
} from "./landmarks.js";

const STYLE = {
  bone: "rgba(255, 255, 255, 0.85)",
  joint: "#4fc3f7",
  tip: "#ffd54f",
  labelBackground: "rgba(0, 0, 0, 0.65)",
  labelText: "#ffffff",
  correct: "#2e9d4f",
  wrong: "#d93025",
  warn: "#e8860c",
  blankBackground: "#202124",
  gridDot: "#ff8a65",
  gridLabel: "#ffffff",
};

// Size used when there is no video (replaying a recording).
const BLANK_WIDTH = 640;
const BLANK_HEIGHT = 360;

export function prefersReducedMotion() {
  return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

export class Overlay {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLVideoElement|null} video  null when drawing replayed frames
   */
  constructor(canvas, video) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.video = video;
    this.lastFrame = null;
    this.activeFlash = null; // { fingerId, correct, shouldUse, wrongHand, until }
    this.blankMode = false;
    this.keyboardGrid = null; // drawn when set, so the student can check it lines up
    this.flipped = false; // "hands facing me": draw turned around to match the video
  }

  /** Draw everything upside down and mirrored, matching the CSS-turned video. Display only. */
  setFlipped(on) {
    this.flipped = on;
    this.redraw();
  }

  /** Show key centers from a keyboard grid (see keyboardGrid.js), or null to hide them. */
  setKeyboardGrid(grid) {
    this.keyboardGrid = grid;
    this.redraw();
  }

  /** Replay draws on a plain background because there is no live video. */
  setBlankMode(on) {
    this.blankMode = on;
    this.redraw();
  }

  matchVideoSize() {
    const width = !this.blankMode && this.video?.videoWidth ? this.video.videoWidth : BLANK_WIDTH;
    const height = !this.blankMode && this.video?.videoHeight ? this.video.videoHeight : BLANK_HEIGHT;
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    // The exercise layout sizes the camera view from its shape (styles.css, .stage-slot-wide).
    this.canvas.parentElement?.style.setProperty("--video-aspect", String(width / height));
  }

  /** Draw one frame of hands. Called for every tracked frame. */
  draw(frame) {
    this.lastFrame = frame;
    this.redraw();
  }

  redraw() {
    this.matchVideoSize();
    const { context: ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (this.blankMode) {
      ctx.fillStyle = STYLE.blankBackground;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (this.keyboardGrid) this.drawKeyboardGrid();
    for (const hand of this.lastFrame?.hands ?? []) this.drawHand(hand);
    this.drawFlash();
  }

  toPixels(point) {
    const x = this.flipped ? 1 - point.x : point.x;
    const y = this.flipped ? 1 - point.y : point.y;
    return { x: x * this.canvas.width, y: y * this.canvas.height };
  }

  /** Which way is "past the fingertips" on screen: up normally, down when flipped. */
  get outward() {
    return this.flipped ? 1 : -1;
  }

  drawHand(hand) {
    const ctx = this.context;
    if (hand.landmarks.length !== LANDMARK_COUNT) return;
    const points = hand.landmarks.map((p) => this.toPixels(p));

    ctx.lineWidth = 3;
    ctx.strokeStyle = STYLE.bone;
    for (const [from, to] of HAND_CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo(points[from].x, points[from].y);
      ctx.lineTo(points[to].x, points[to].y);
      ctx.stroke();
    }
    for (const fingerName of Object.keys(FINGERTIP_BY_FINGER_NAME)) {
      this.dot(points[FINGERTIP_BY_FINGER_NAME[fingerName]], 6, STYLE.tip);
    }
    this.dot(points[WRIST], 5, STYLE.joint);
    // The L/R label lets the student check the orientation settings at a glance.
    this.label(points[WRIST], hand.side);
  }

  drawKeyboardGrid() {
    const ctx = this.context;
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    for (const [code, key] of Object.entries(KEY_LAYOUT)) {
      // Wide keys (Shift, Enter, Space...) have no single spot a finger lands on.
      if (key.width > 1) continue;
      const center = this.toPixels(keyCenterInImage(this.keyboardGrid, code));
      this.dot(center, 3, STYLE.gridDot);
      ctx.fillStyle = STYLE.labelBackground;
      ctx.fillRect(center.x - 7, center.y - 19, 14, 15);
      ctx.fillStyle = STYLE.gridLabel;
      ctx.fillText(keyLabel(code), center.x, center.y - 4);
    }
  }

  dot({ x, y }, radius, color) {
    const ctx = this.context;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  /** A small label on the wrist, on the side away from the fingers. */
  label({ x, y }, text) {
    const ctx = this.context;
    const centerY = y - this.outward * 29;
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = STYLE.labelBackground;
    ctx.fillRect(x - 16, centerY - 15, 32, 30);
    ctx.fillStyle = STYLE.labelText;
    ctx.fillText(text, x, centerY);
  }

  /**
   * Highlight a fingertip after attribution. For a wrong finger, `shouldUse`
   * also marks the finger that should have pressed the key, and `wrongHand`
   * colors the mistake orange. Mistakes stay up longer so there is time to look.
   * With reduced motion the highlight stays (no blinking) until the next result.
   */
  flash(fingerId, correct, { shouldUse = null, wrongHand = false } = {}) {
    const duration = correct ? FLASH_DURATION_MS : MISTAKE_FLASH_DURATION_MS;
    const until = prefersReducedMotion() ? Infinity : performance.now() + duration;
    this.activeFlash = { fingerId, correct, shouldUse, wrongHand, until };
    this.redraw();
    if (until !== Infinity) {
      setTimeout(() => this.redraw(), duration + 20);
    }
  }

  clearFlash() {
    this.activeFlash = null;
    this.redraw();
  }

  drawFlash() {
    const flash = this.activeFlash;
    if (!flash) return;
    if (performance.now() > flash.until) {
      this.activeFlash = null;
      return;
    }
    if (flash.correct) {
      this.markFinger(flash.fingerId, STYLE.correct, "✓", false);
      return;
    }
    this.markFinger(flash.fingerId, flash.wrongHand ? STYLE.warn : STYLE.wrong, "✗", false);
    // The finger that should have pressed the key: a dashed ring and a check.
    if (flash.shouldUse) this.markFinger(flash.shouldUse, STYLE.correct, "✓", true);
  }

  /** Ring a fingertip and put a symbol past its tip, so the result does not depend on color. */
  markFinger(fingerId, color, symbol, dashed) {
    const { side, index } = fingertipLocation(fingerId);
    const hand = this.lastFrame?.hands.find((h) => h.side === side);
    if (!hand) return;
    const tip = this.toPixels(hand.landmarks[index]);
    const ctx = this.context;

    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 20, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = color;
    ctx.setLineDash(dashed ? [7, 5] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    const symbolY = tip.y + this.outward * 48;
    ctx.font = "bold 28px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = STYLE.labelBackground;
    ctx.fillRect(tip.x - 18, symbolY - 18, 36, 36);
    ctx.fillStyle = color;
    ctx.fillText(symbol, tip.x, symbolY);
  }
}
