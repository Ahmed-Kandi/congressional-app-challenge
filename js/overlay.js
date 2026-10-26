// Draws the hand skeleton on a canvas laid exactly over the video, and
// flashes a fingertip green (right finger) or red (wrong finger).
// Colors are never the only signal: flashes also draw a check or a cross.

import { FLASH_DURATION_MS, MISTAKE_FLASH_DURATION_MS } from "./config.js";
import { KEY_LAYOUT, hoveredKey, keyCenterInImage, keyLabel } from "./keyboardGrid.js";
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
  fingerTagBackground: "rgba(30, 31, 33, 0.9)",
  fingerTagBorder: "#ff6b6b",
  fingerTagText: "#ffffff",
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
    this.rotated = false;
    this.flipped = false;
    this.keyboardGrid = null; // drawn when set, so the student can check it lines up
    this.keyboardTouches = null;
    this.fingerLabels = false;
    this.sideLabels = true;
    this.handsVisible = true;
    this.hoverGrid = null;
  }

  /** Hide hand landmarks and labels until the setup flow reaches hand placement. */
  setHandsVisible(on) {
    if (this.handsVisible === on) return;
    this.handsVisible = on;
    this.redraw();
  }

  /** Show key centers from a keyboard grid (see keyboardGrid.js), or null to hide them. */
  setKeyboardGrid(grid) {
    this.keyboardGrid = grid;
    this.redraw();
  }

  /** Show the corner positions as the student clicks them in the video. */
  setKeyboardTouches(touches) {
    this.keyboardTouches = touches;
    this.redraw();
  }

  /** Name each tracked fingertip in the camera setup view. */
  setFingerLabels(on) {
    if (this.fingerLabels === on) return;
    this.fingerLabels = on;
    this.redraw();
  }

  /** Show or hide the L/R wrist tags independently of fingertip names. */
  setSideLabels(on) {
    if (this.sideLabels === on) return;
    this.sideLabels = on;
    this.redraw();
  }

  /** Use a saved keyboard map to show the key under each visible fingertip. */
  setHoverGrid(grid) {
    if (this.hoverGrid === grid) return;
    this.hoverGrid = grid;
    this.redraw();
  }

  /** Replay draws on a plain background because there is no live video. */
  setBlankMode(on) {
    this.blankMode = on;
    this.redraw();
  }

  /** Rotate overlay positions to match a camera preview rotated by 180 degrees. */
  setRotated(on) {
    if (this.rotated === on) return;
    this.rotated = on;
    this.redraw();
  }

  /** Turn the displayed image around without changing the tracked camera coordinates. */
  setFlipped(on) {
    if (this.flipped === on) return;
    this.flipped = on;
    this.redraw();
  }

  /** Direction away from the fingertips in the displayed camera view. */
  get outward() {
    return this.rotated !== this.flipped ? 1 : -1;
  }

  matchVideoSize() {
    const width = !this.blankMode && this.video?.videoWidth ? this.video.videoWidth : BLANK_WIDTH;
    const height = !this.blankMode && this.video?.videoHeight ? this.video.videoHeight : BLANK_HEIGHT;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.canvas.parentElement?.style.setProperty("--video-aspect", String(width / height));
    }
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
    const hands = this.handsVisible ? this.lastFrame?.hands ?? [] : [];
    for (const hand of hands) this.drawHand(hand);
    if (this.handsVisible && this.fingerLabels) this.drawFingerLabels(hands);
    if (this.keyboardTouches) this.drawKeyboardTouches();
    if (this.handsVisible) this.drawFlash();
  }

  toPixels(point) {
    const turned = this.rotated !== this.flipped;
    const x = turned ? 1 - point.x : point.x;
    const y = turned ? 1 - point.y : point.y;
    return { x: x * this.canvas.width, y: y * this.canvas.height };
  }

  /** Canvas pixels per displayed pixel after object-fit scales the camera image. */
  displayScale() {
    const { canvas } = this;
    const visibleWidth = Math.min(
      canvas.clientWidth || canvas.width,
      (canvas.clientHeight || canvas.height) * canvas.width / canvas.height,
    );
    return canvas.width / Math.max(1, visibleWidth);
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
    if (this.sideLabels) this.label(points[WRIST], hand.side);
  }

  drawFingerLabels(hands) {
    const { context: ctx, canvas } = this;
    const scale = this.displayScale();
    const fontSize = 16 * scale;
    const height = 26 * scale;
    const padding = 8 * scale;
    const gap = 5 * scale;
    const edge = 4 * scale;
    const placed = [];
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const hand of hands) {
      if (hand.landmarks.length !== LANDMARK_COUNT) continue;
      for (const [finger, index] of Object.entries(FINGERTIP_BY_FINGER_NAME)) {
        const tip = this.toPixels(hand.landmarks[index]);
        const key = this.hoverGrid ? hoveredKey(this.hoverGrid, hand.landmarks[index]) : null;
        const name = key ? `${finger.toLowerCase()} · ${key.label}` : finger.toLowerCase();
        const width = ctx.measureText(name).width + padding * 2;
        const centeredX = tip.x - width / 2;
        const aboveY = tip.y - height - 12 * scale;
        const belowY = tip.y + 12 * scale;
        let box = null;
        for (const y of [aboveY, aboveY - height - gap, aboveY - 2 * (height + gap), belowY, belowY + height + gap]) {
          for (const shift of [0, -width * 0.55, width * 0.55]) {
            const x = Math.max(edge, Math.min(canvas.width - width - edge, centeredX + shift));
            const candidate = { x, y, width, height };
            if (y < edge || y + height > canvas.height - edge) continue;
            if (placed.some((other) =>
              x < other.x + other.width + gap && x + width + gap > other.x &&
              y < other.y + other.height + gap && y + height + gap > other.y)) continue;
            box = candidate;
            break;
          }
          if (box) break;
        }
        if (!box) {
          box = { x: Math.max(edge, Math.min(canvas.width - width - edge, centeredX)),
            y: Math.max(edge, Math.min(canvas.height - height - edge, aboveY)), width, height };
        }
        placed.push(box);

        const lineEndY = box.y > tip.y ? box.y : box.y + height;
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(box.x + width / 2, lineEndY);
        ctx.lineWidth = 1.5 * scale;
        ctx.strokeStyle = STYLE.fingerTagBorder;
        ctx.stroke();
        ctx.fillStyle = STYLE.fingerTagBackground;
        ctx.fillRect(box.x, box.y, width, height);
        ctx.lineWidth = 1.5 * scale;
        ctx.strokeStyle = STYLE.fingerTagBorder;
        ctx.strokeRect(box.x, box.y, width, height);
        ctx.fillStyle = STYLE.fingerTagText;
        ctx.fillText(name, box.x + width / 2, box.y + height / 2);
      }
    }
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

  drawKeyboardTouches() {
    const ctx = this.context;
    ctx.font = "bold 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const [code, point] of Object.entries(this.keyboardTouches)) {
      const position = this.toPixels(point);
      this.dot(position, 14, STYLE.gridDot);
      ctx.fillStyle = STYLE.labelBackground;
      ctx.fillText(keyLabel(code), position.x, position.y);
    }
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
    const scale = this.fingerLabels ? this.displayScale() : 1;
    const width = 32 * scale;
    const height = 30 * scale;
    const left = Math.max(0, Math.min(this.canvas.width - width, x - width / 2));
    const centerY = y - this.outward * 29 * scale;
    const top = Math.max(0, Math.min(this.canvas.height - height, centerY - height / 2));
    ctx.font = `bold ${22 * scale}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = STYLE.labelBackground;
    ctx.fillRect(left, top, width, height);
    ctx.fillStyle = STYLE.labelText;
    ctx.fillText(text, left + width / 2, top + height / 2);
  }

  /**
   * Highlight a fingertip after attribution.
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
    if (flash.shouldUse) this.markFinger(flash.shouldUse, STYLE.correct, "✓", true);
  }

  /** Mark the observed finger, and optionally the expected one, without relying on color alone. */
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
