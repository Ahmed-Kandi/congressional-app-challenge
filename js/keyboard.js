// Captures key presses with precise timestamps.
// event.timeStamp is on the same clock as performance.now(), which is the
// clock the camera frames use, so keys and frames can be lined up in time.

// Keys whose browser default (scrolling, moving focus, quick-find, going back)
// would interrupt an exercise.
export const PREVENT_DEFAULT_CODES = new Set(["Space", "Tab", "Quote", "Slash", "Backspace"]);

const FORM_CONTROL_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON"]);

/** True if the event should be ignored entirely. */
export function shouldIgnore(event, typingArea) {
  if (event.repeat) return true; // holding a key down is not a new press
  // Shortcuts like Cmd+R or Ctrl+Tab are not typing.
  if (event.ctrlKey || event.metaKey || event.altKey) return true;
  const target = event.target;
  if (target === typingArea) return false;
  return Boolean(target && (FORM_CONTROL_TAGS.has(target.tagName) || target.isContentEditable));
}

/**
 * Start listening. Returns a function that stops listening.
 * @param {object} options
 * @param {(keyEvent: {code: string, key: string, t: number}) => void} options.onKey
 * @param {() => boolean} options.isExerciseActive
 * @param {HTMLElement} options.typingArea  the one focusable element that still counts as typing
 */
export function startKeyboardCapture({ onKey, isExerciseActive, typingArea }) {
  function handleKeyDown(event) {
    if (shouldIgnore(event, typingArea)) return;
    if (isExerciseActive() && PREVENT_DEFAULT_CODES.has(event.code)) event.preventDefault();
    onKey({ code: event.code, key: event.key, t: event.timeStamp });
  }
  document.addEventListener("keydown", handleKeyDown);
  return () => document.removeEventListener("keydown", handleKeyDown);
}
