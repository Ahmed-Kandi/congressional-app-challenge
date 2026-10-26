// The tutorial page before each Level 1 and 2 exercise: what the exercise
// teaches, which finger presses each of its keys (on a keyboard drawing), and
// a short walk-through where the student presses every key once.

import { codeForChar, describeFingers, expectedFingers } from "./fingerMap.js";

// The letter rows of a US keyboard, with each row's stagger in key widths.
const KEYBOARD_ROWS = [
  { keys: "qwertyuiop", offset: 0 },
  { keys: "asdfghjkl;", offset: 0.25 },
  { keys: "zxcvbnm,./", offset: 0.75 },
];
const HOME_KEYS = new Set("asdfjkl;");
const REACH_FROM = { g: "F", h: "J" };

/** The physical key code for a tutorial key ("f", ";", "Space"). */
export function tutorialKeyCode(key) {
  return key === "Space" ? "Space" : codeForChar(key);
}

/** The finger(s) that press a tutorial key. */
export function fingersForKey(key) {
  return expectedFingers(tutorialKeyCode(key));
}

/** How a key is shown to the student: "F", ";", "Space". */
export function keyLabel(key) {
  return key === "Space" ? "Space" : key.toUpperCase();
}

/** One short line about where a key lives. */
export function keyRole(key) {
  if (key === "Space") return "between words";
  if (HOME_KEYS.has(key)) return "home key: rest here";
  if (REACH_FROM[key]) return `reach from ${REACH_FROM[key]}, then come back`;
  return "reach";
}

/**
 * The walk-through: the student presses each key in order. Compares physical
 * key codes, so Caps Lock or Shift doesn't matter.
 */
export function createWalkthrough(keys) {
  let position = 0;
  return {
    get current() {
      return keys[position] ?? null;
    },
    get position() {
      return position;
    },
    get done() {
      return position >= keys.length;
    },
    /** @returns {"correct"|"done"|"wrong"|"ignored"} */
    press(code) {
      if (position >= keys.length) return "ignored";
      if (code !== tutorialKeyCode(keys[position])) return "wrong";
      position += 1;
      return position >= keys.length ? "done" : "correct";
    },
  };
}

/** A finger ID as a CSS class, so each finger has its own color. */
function fingerClass(key) {
  const fingers = fingersForKey(key);
  return fingers.length === 1 ? `finger-${fingers[0]}` : "finger-thumbs";
}

function kbd(text) {
  const element = document.createElement("kbd");
  element.textContent = text;
  return element;
}

/**
 * Run the tutorial screen.
 * @param {object} options
 * @param {object} options.elements  { kicker, title, intro, text, tip, keyboard, keyCards, prompt, progress, status, startButton }
 */
export function createTutorialScreen({ elements }) {
  let tutorial = null;
  let walk = null;
  let onStart = () => {};
  const keyElements = new Map();

  function renderKeyboard() {
    keyElements.clear();
    const rows = KEYBOARD_ROWS.map(({ keys, offset }) => {
      const row = document.createElement("div");
      row.className = "tutorial-kb-row";
      row.style.setProperty("--offset", offset);
      for (const key of keys) row.append(renderKey(key));
      return row;
    });
    const spaceRow = document.createElement("div");
    spaceRow.className = "tutorial-kb-row tutorial-kb-space-row";
    spaceRow.append(renderKey("Space"));
    elements.keyboard.replaceChildren(...rows, spaceRow);
  }

  function renderKey(key) {
    const element = document.createElement("span");
    element.className = "tutorial-kb-key";
    element.textContent = key === "Space" ? "" : keyLabel(key);
    if (key === "Space") element.classList.add("is-space");
    if (key === "f" || key === "j") element.classList.add("has-bump");
    if (tutorial.keys.includes(key)) {
      element.classList.add("is-used", fingerClass(key));
      if (tutorial.newKeys.includes(key)) element.classList.add("is-new");
    }
    keyElements.set(key, element);
    return element;
  }

  function renderKeyCards() {
    elements.keyCards.replaceChildren(
      ...tutorial.keys.map((key) => {
        const item = document.createElement("li");
        item.className = `tutorial-key-card ${fingerClass(key)}`;
        const name = document.createElement("span");
        name.className = "tutorial-key-finger";
        name.textContent = describeFingers(fingersForKey(key));
        const role = document.createElement("small");
        role.textContent = keyRole(key);
        item.append(kbd(keyLabel(key)), name, role);
        if (tutorial.newKeys.includes(key)) {
          const badge = document.createElement("span");
          badge.className = "tutorial-new-badge";
          badge.textContent = "new";
          item.append(badge);
        }
        return item;
      }),
    );
  }

  function renderProgress() {
    elements.progress.replaceChildren(
      ...tutorial.keys.map((key, i) => {
        const dot = document.createElement("li");
        dot.textContent = keyLabel(key);
        dot.classList.toggle("is-done", i < walk.position);
        dot.classList.toggle("is-current", i === walk.position);
        return dot;
      }),
    );
    for (const [key, element] of keyElements) {
      const i = tutorial.keys.indexOf(key);
      element.classList.toggle("is-current", i === walk.position);
      element.classList.toggle("is-done", i >= 0 && i < walk.position);
    }
  }

  function renderPrompt() {
    elements.prompt.replaceChildren();
    if (walk.done) {
      elements.prompt.textContent = "You know every key in this exercise.";
      return;
    }
    const key = walk.current;
    const fingers = describeFingers(fingersForKey(key));
    elements.prompt.append("Press ", kbd(keyLabel(key)), " with your ");
    const strong = document.createElement("strong");
    strong.textContent = fingers;
    elements.prompt.append(strong, key === "Space" ? "." : " finger.");
  }

  /**
   * Show a tutorial (from exercises.js#getTutorial).
   * @param {() => void} startExercise  called by Start exercise, Skip, or Enter when done
   */
  function open(nextTutorial, startExercise) {
    tutorial = nextTutorial;
    onStart = startExercise;
    walk = createWalkthrough(tutorial.keys);
    const level = tutorial.levelId === 1 ? "Level 1: Home row drills" : "Level 2: Home row words";
    elements.kicker.textContent = `${level} · Exercise ${tutorial.index + 1} of ${tutorial.count}`;
    elements.title.textContent = tutorial.title;
    elements.intro.textContent = tutorial.intro;
    elements.text.textContent = tutorial.text;
    elements.tip.textContent = tutorial.tip;
    elements.status.textContent = "Rest your fingers on the home row first, then press each key once.";
    elements.startButton.disabled = true;
    renderKeyboard();
    renderKeyCards();
    renderPrompt();
    renderProgress();
  }

  /** Feed every key press here while the tutorial is on screen. */
  function handleKey(keyEvent) {
    if (!walk) return;
    if (walk.done) {
      if (keyEvent.code === "Enter") start();
      return;
    }
    const expected = walk.current;
    const outcome = walk.press(keyEvent.code);
    if (outcome === "wrong") {
      const pressed = keyEvent.key === " " ? "Space" : keyEvent.key;
      elements.status.textContent = `That was ${pressed}. Find ${keyLabel(expected)} with your ${describeFingers(fingersForKey(expected))}.`;
      return;
    }
    elements.status.textContent = outcome === "done"
      ? "Nice work! Press Enter or Start exercise when you're ready."
      : `Got ${keyLabel(expected)}.`;
    elements.startButton.disabled = !walk.done;
    renderPrompt();
    renderProgress();
    if (walk.done) elements.startButton.focus({ preventScroll: true });
  }

  /** Leave the tutorial and start the exercise. */
  function start() {
    walk = null;
    onStart();
  }

  return { open, handleKey, start };
}
