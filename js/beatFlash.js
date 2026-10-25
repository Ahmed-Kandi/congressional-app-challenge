// A translucent full-screen glow that pulses once per keystroke, like a drum
// beat: green when the key and the finger were both right, red when either was
// wrong. It is decoration only: the feedback line says the same thing in words.

import { BEAT_FLASH_DURATION_MS } from "./config.js";
import { prefersReducedMotion } from "./overlay.js";

export function createBeatFlash(element) {
  let animation = null;
  return {
    /** @param {"good"|"bad"|null} kind  from feedback.js#beatKind; null does nothing */
    beat(kind) {
      if (!kind) return;
      element.dataset.beat = kind;
      // Reduced motion: no flashing at all. The words and fingertip mark remain.
      if (prefersReducedMotion() || typeof element.animate !== "function") return;
      // A new key restarts the pulse at once instead of waiting for the last to fade.
      animation?.cancel();
      animation = element.animate(
        [
          { opacity: 0, transform: "scale(1.04)" },
          { opacity: 1, transform: "scale(1)", offset: 0.12 },
          { opacity: 0, transform: "scale(1)" },
        ],
        { duration: BEAT_FLASH_DURATION_MS, easing: "ease-out" },
      );
    },
  };
}
