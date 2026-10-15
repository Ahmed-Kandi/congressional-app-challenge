// Draws the hand skeleton on a canvas laid exactly over the video, and
// flashes a fingertip green (right finger) or red (wrong finger).
// Colors are never the only signal: flashes also draw a check or a cross.

import { FLASH_DURATION_MS } from "./config.js";
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
  blankBackground: "#202124",
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
    this.activeFlash = null; // { fingerId, correct, until }
    this.blankMode = false;
  }

  /** Replay draws on a plain background because there is no live video. */
  setBlankMode(on) {
    this.blankMode = on;
    this.redraw();
  }

  matchVideoSize() {
    const width = !this.blankMode && this.video?.videoWidth ? this.video.videoWidth : BLANK_WIDTH;
    const height = !this.blankMode && this.video?.videoHeight ? this.video.videoHeight : BLANK_HEIGHT;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
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
    for (const hand of this.lastFrame?.hands ?? []) this.drawHand(hand);
    this.drawFlash();
  }

  toPixels(point) {
    return { x: point.x * this.canvas.width, y: point.y * this.canvas.height };
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

  dot({ x, y }, radius, color) {
    const ctx = this.context;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  label({ x, y }, text) {
    const ctx = this.context;
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = STYLE.labelBackground;
    ctx.fillRect(x - 16, y + 14, 32, 30);
    ctx.fillStyle = STYLE.labelText;
    ctx.fillText(text, x, y + 29);
  }

  /**
   * Highlight a fingertip after attribution.
   * With reduced motion the highlight stays (no blinking) until the next result.
   */
  flash(fingerId, correct) {
    const until = prefersReducedMotion() ? Infinity : performance.now() + FLASH_DURATION_MS;
    this.activeFlash = { fingerId, correct, until };
    this.redraw();
    if (until !== Infinity) {
      setTimeout(() => this.redraw(), FLASH_DURATION_MS + 20);
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
    const { side, index } = fingertipLocation(flash.fingerId);
    const hand = this.lastFrame?.hands.find((h) => h.side === side);
    if (!hand) return;
    const tip = this.toPixels(hand.landmarks[index]);
    const ctx = this.context;
    const color = flash.correct ? STYLE.correct : STYLE.wrong;

    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 20, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = color;
    ctx.stroke();
    // Symbol above the fingertip so the result does not depend on color.
    ctx.font = "bold 28px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = STYLE.labelBackground;
    ctx.fillRect(tip.x - 18, tip.y - 66, 36, 36);
    ctx.fillStyle = color;
    ctx.fillText(flash.correct ? "✓" : "✗", tip.x, tip.y - 48);
  }
}
