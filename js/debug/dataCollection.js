// Data collection run: the app asks for one key at a time with a named finger
// ("Press F with your left index"), records the camera and keys, and writes
// the labels itself, because it knows which finger it asked for.
//
// About 1 in 5 prompts asks for a WRONG finger on purpose, so the recordings
// contain labeled mistakes as well as good form.
//
// Labels here come from the instructions given to the typist, never from
// looking at the hands. This file does not decide which finger pressed a key.

import { expectedFingers, fingerLabel } from "../fingerMap.js";
import { keyLabel } from "../keyboardGrid.js";
import { labelsFromTruths } from "./labels.js";

// Every letter plus the punctuation in the exercises. Space is added separately
// so each thumb gets asked for by name.
export const COLLECTION_CODES = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => `Key${letter}`),
  "Semicolon", "Comma", "Period", "Slash", "Quote",
];
const SPACE_PROMPTS = ["L_THUMB", "R_THUMB", "L_THUMB", "R_THUMB"];

// Fingers of one hand, from the outside in. Used to pick a believable wrong finger.
const HAND_ORDER = ["PINKY", "RING", "MIDDLE", "INDEX"];

/** Small seeded random number generator (mulberry32), so a run can be repeated from its seed. */
export function makeRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle into a new array. */
function shuffled(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * A wrong finger a real student might use instead: a neighbour on the same
 * hand, or that hand's index finger (hunt and peck).
 */
export function wrongFingerFor(finger, random) {
  const [side, name] = finger.split("_");
  const at = HAND_ORDER.indexOf(name);
  const candidates = new Set([HAND_ORDER[at - 1], HAND_ORDER[at + 1], "INDEX"]);
  candidates.delete(undefined);
  candidates.delete(name);
  const options = [...candidates].map((n) => `${side}_${n}`);
  return options[Math.floor(random() * options.length)];
}

/**
 * The list of prompts for one run.
 * @returns {Array<{code: string, label: string, finger: string, onPurposeWrong: boolean}>}
 */
export function buildPrompts({ repeats, wrongShare, seed }) {
  const random = makeRandom(seed);
  const keyPrompts = COLLECTION_CODES.flatMap((code) =>
    Array.from({ length: repeats }, () => ({ code, finger: expectedFingers(code)[0], onPurposeWrong: false })),
  );
  // Pick exactly round(share x count) key prompts to turn into wrong-finger prompts.
  const wrongCount = Math.round(keyPrompts.length * wrongShare);
  for (const prompt of shuffled(keyPrompts, random).slice(0, wrongCount)) {
    prompt.finger = wrongFingerFor(prompt.finger, random);
    prompt.onPurposeWrong = true;
  }
  const spacePrompts = SPACE_PROMPTS.map((finger) => ({ code: "Space", finger, onPurposeWrong: false }));
  return shuffled([...keyPrompts, ...spacePrompts], random).map((prompt) => ({
    ...prompt,
    label: prompt.code === "Space" ? "Space" : keyLabel(prompt.code),
  }));
}

/** "left index finger", "right thumb". */
export function fingerName(finger) {
  return finger.endsWith("THUMB") ? fingerLabel(finger) : `${fingerLabel(finger)} finger`;
}

/** What to show for a prompt: "Press F with your left index finger." */
export function describePrompt(prompt) {
  return `Press ${prompt.label} with your ${fingerName(prompt.finger)}${prompt.onPurposeWrong ? " (wrong on purpose)" : ""}.`;
}

/**
 * One run. Feed it EVERY key the recorder records, in the same order, so key
 * number N in the labels is key number N in the recording.
 */
export function createCollectionSession(prompts) {
  let next = 0; // index of the prompt being asked for
  let lastAccepted = null; // { keyNumber, promptIndex } of the most recent counted key
  const keyEvents = [];
  const truths = []; // one per key event: [finger] or null (not counted)

  function current() {
    return prompts[next] ?? null;
  }

  /**
   * @param {{code: string, key: string, t: number}} keyEvent
   * @param {{handsVisible: boolean}} context
   * @returns {{counted: boolean, message: string}}
   */
  function handleKey(keyEvent, { handsVisible }) {
    keyEvents.push(keyEvent);
    truths.push(null); // not counted unless it matches below
    const prompt = current();

    // Backspace = "I used the wrong finger by accident": drop the last counted key and ask again.
    if (keyEvent.code === "Backspace") {
      if (!lastAccepted) return { counted: false, message: prompt ? `Nothing to undo. ${describePrompt(prompt)}` : "Nothing to undo." };
      truths[lastAccepted.keyNumber - 1] = null;
      next = lastAccepted.promptIndex;
      lastAccepted = null;
      return { counted: false, message: `Removed the last key. ${describePrompt(current())}` };
    }
    if (!prompt) return { counted: false, message: "All done." };
    if (!handsVisible) {
      return { counted: false, message: `Both hands must be in view. That key was not counted. ${describePrompt(prompt)}` };
    }
    if (keyEvent.code !== prompt.code) {
      const pressed = keyEvent.key === " " ? "Space" : keyEvent.key;
      return { counted: false, message: `That was ${pressed}, not counted. ${describePrompt(prompt)}` };
    }
    truths[truths.length - 1] = [prompt.finger];
    lastAccepted = { keyNumber: truths.length, promptIndex: next };
    next += 1;
    return { counted: true, message: current() ? "" : "All done." };
  }

  /** Labels for everything recorded so far, in the shared labels format. */
  function labels(extra = {}) {
    return labelsFromTruths(keyEvents, truths, extra);
  }

  return {
    handleKey,
    labels,
    current,
    get finished() {
      return next >= prompts.length;
    },
    get progress() {
      return { done: next, total: prompts.length };
    },
    get countedKeys() {
      return truths.filter(Boolean).length;
    },
  };
}
