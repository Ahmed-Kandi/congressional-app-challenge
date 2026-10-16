// Which finger SHOULD press each key on a US QWERTY keyboard.
// Keys are KeyboardEvent.code values (the physical key), never event.key,
// so the map is the same no matter what character the key types.
// Note: Digit6 goes to the right index finger. Typing charts disagree on this.

export const FINGERS = [
  "L_PINKY", "L_RING", "L_MIDDLE", "L_INDEX", "L_THUMB",
  "R_THUMB", "R_INDEX", "R_MIDDLE", "R_RING", "R_PINKY",
];

export const FINGER_LABELS = {
  L_PINKY: "left pinky",
  L_RING: "left ring",
  L_MIDDLE: "left middle",
  L_INDEX: "left index",
  L_THUMB: "left thumb",
  R_THUMB: "right thumb",
  R_INDEX: "right index",
  R_MIDDLE: "right middle",
  R_RING: "right ring",
  R_PINKY: "right pinky",
};

const CODES_BY_FINGER = {
  L_PINKY: ["Backquote", "Digit1", "KeyQ", "KeyA", "KeyZ", "Tab", "CapsLock", "ShiftLeft"],
  L_RING: ["Digit2", "KeyW", "KeyS", "KeyX"],
  L_MIDDLE: ["Digit3", "KeyE", "KeyD", "KeyC"],
  L_INDEX: ["Digit4", "Digit5", "KeyR", "KeyT", "KeyF", "KeyG", "KeyV", "KeyB"],
  R_INDEX: ["Digit6", "Digit7", "KeyY", "KeyU", "KeyH", "KeyJ", "KeyN", "KeyM"],
  R_MIDDLE: ["Digit8", "KeyI", "KeyK", "Comma"],
  R_RING: ["Digit9", "KeyO", "KeyL", "Period"],
  R_PINKY: [
    "Digit0", "Minus", "Equal", "KeyP", "BracketLeft", "BracketRight", "Backslash",
    "Semicolon", "Quote", "Slash", "Enter", "Backspace", "ShiftRight",
  ],
};

// Flip the table above into code -> [finger] for quick lookup.
const FINGERS_BY_CODE = new Map();
for (const [finger, codes] of Object.entries(CODES_BY_FINGER)) {
  for (const code of codes) FINGERS_BY_CODE.set(code, [finger]);
}
// Either thumb is correct for the space bar.
FINGERS_BY_CODE.set("Space", ["L_THUMB", "R_THUMB"]);

/** Every key code that has an expected finger. */
export const MAPPED_CODES = [...FINGERS_BY_CODE.keys()];

/**
 * The finger(s) that should press a key.
 * @param {string} code  KeyboardEvent.code, e.g. "KeyF"
 * @returns {string[]}  one finger ID, two for Space, [] for unmapped keys
 */
export function expectedFingers(code) {
  return [...(FINGERS_BY_CODE.get(code) ?? [])];
}

export function isFingerId(value) {
  return FINGERS.includes(value);
}

export function fingerLabel(fingerId) {
  return FINGER_LABELS[fingerId] ?? fingerId;
}

/** Human text for a list of acceptable fingers: "left index" or "either thumb". */
export function describeFingers(fingers) {
  if (fingers.length === 2 && fingers.includes("L_THUMB") && fingers.includes("R_THUMB")) {
    return "either thumb";
  }
  return fingers.map(fingerLabel).join(" or ");
}

// ---- Characters to keys (used to show which finger the NEXT character needs) ----

// Shifted symbols on US QWERTY and the key that types them.
const SYMBOL_CODES = {
  " ": "Space",
  "`": "Backquote", "~": "Backquote",
  "-": "Minus", "_": "Minus",
  "=": "Equal", "+": "Equal",
  "[": "BracketLeft", "{": "BracketLeft",
  "]": "BracketRight", "}": "BracketRight",
  "\\": "Backslash", "|": "Backslash",
  ";": "Semicolon", ":": "Semicolon",
  "'": "Quote", '"': "Quote",
  ",": "Comma", "<": "Comma",
  ".": "Period", ">": "Period",
  "/": "Slash", "?": "Slash",
  "!": "Digit1", "@": "Digit2", "#": "Digit3", "$": "Digit4", "%": "Digit5",
  "^": "Digit6", "&": "Digit7", "*": "Digit8", "(": "Digit9", ")": "Digit0",
};

const SHIFTED_SYMBOLS = new Set('~_+{}|:"<>?!@#$%^&*()');

/** The physical key that types a character, or null if it is not on the keyboard. */
export function codeForChar(char) {
  if (/^[a-z]$/i.test(char)) return `Key${char.toUpperCase()}`;
  if (/^[0-9]$/.test(char)) return `Digit${char}`;
  return SYMBOL_CODES[char] ?? null;
}

/** True when typing this character needs Shift held down. */
export function needsShift(char) {
  return /^[A-Z]$/.test(char) || SHIFTED_SYMBOLS.has(char);
}

/** Fingers for the character's key, e.g. "J" -> ["R_INDEX"]. */
export function expectedFingersForChar(char) {
  const code = codeForChar(char);
  return code ? expectedFingers(code) : [];
}
