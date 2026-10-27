// Turn one lesson's observed errors into short, repeatable practice drills.
// Finger suggestions require a camera check; key suggestions use typing accuracy.

import { FINGERS, fingerLabel } from "./fingerMap.js";

const FINGER_KEYS = {
  L_PINKY: ["a", "q", "z"],
  L_RING: ["s", "w", "x"],
  L_MIDDLE: ["d", "e", "c"],
  L_INDEX: ["f", "r", "t", "g", "v", "b"],
  R_INDEX: ["j", "y", "u", "h", "n", "m"],
  R_MIDDLE: ["k", "i", ","],
  R_RING: ["l", "o", "."],
  R_PINKY: [";", "p", "/"],
};

function attemptsText(misses, total) {
  return `${misses} ${misses === 1 ? "miss" : "misses"} in ${total} checked ${total === 1 ? "press" : "presses"}`;
}

function keyName(char) {
  if (char === " ") return "Space";
  return char.toUpperCase();
}

function fingerDrill(finger) {
  if (finger.endsWith("THUMB")) {
    return "fj dk sl a; fj dk sl a; as df jk l; as df jk l;";
  }
  const keys = FINGER_KEYS[finger] ?? ["f", "j"];
  const [first, second, third = first] = keys;
  return `${first} ${first} ${second} ${second} ${third} ${third} ${first}${second} ${second}${first} ${first}${third} ${third}${first} ${first} ${second} ${third} ${first}${second}${third}`;
}

function keyDrill(char) {
  if (char === " ") return "fj dk sl a; fj dk sl a; fj dk sl a; fj dk sl a;";
  return `${char} ${char} ${char} ${char} f${char} j${char} ${char}f ${char}j ${char}${char} ${char}${char} f${char} j${char} ${char}f ${char}j`;
}

/** Suggestions are based only on attempts made in this lesson, not a diagnosis of a lasting habit. */
export function buildPracticeRecommendations(summary) {
  const fingers = FINGERS.flatMap((finger) => {
    // Space accepts either thumb, and the session splits its count between both.
    if (finger === "R_THUMB") return [];
    const counts = summary.fingerAccuracyByFinger?.[finger];
    if (!counts) return [];
    const factor = finger === "L_THUMB" ? 2 : 1;
    const total = counts.total * factor;
    if (total < 2) return [];
    const misses = (counts.total - counts.correct) * factor;
    if (misses < 1) return [];
    return [{ finger, misses, total }];
  }).sort((a, b) => b.misses / b.total - a.misses / a.total || b.misses - a.misses || a.finger.localeCompare(b.finger));

  const keys = Object.entries(summary.keyAccuracyByKey ?? {}).flatMap(([char, counts]) => {
    if (!counts || counts.total < 1) return [];
    const misses = counts.total - counts.correct;
    if (misses < 1) return [];
    return [{ char, misses, total: counts.total }];
  }).sort((a, b) => b.misses / b.total - a.misses / a.total || b.misses - a.misses || a.char.localeCompare(b.char));

  const recommendations = [];
  for (const { finger, misses, total } of fingers.slice(0, 2)) {
    const label = finger === "L_THUMB" ? "either thumb" : fingerLabel(finger);
    recommendations.push({
      type: "finger",
      label: "Finger placement",
      title: `Practice your ${label}`,
      detail: `The camera checked this finger in this lesson: ${attemptsText(misses, total)}. Slow down and return it to its home position after each press.`,
      metric: `${Math.round((1 - misses / total) * 100)}% finger accuracy`,
      button: `Practice ${label}`,
      drill: { title: `${label} practice`, text: fingerDrill(finger) },
    });
  }
  for (const { char, misses, total } of keys.slice(0, recommendations.length ? 1 : 2)) {
    const label = keyName(char);
    recommendations.push({
      type: "key",
      label: "Key accuracy",
      title: `Give ${label} another pass`,
      detail: `You missed ${label} ${misses} ${misses === 1 ? "time" : "times"} in ${total} ${total === 1 ? "attempt" : "attempts"}. This short drill repeats it in a steady rhythm.`,
      metric: `${Math.round((1 - misses / total) * 100)}% key accuracy`,
      button: `Practice ${label}`,
      drill: { title: `${label} key practice`, text: keyDrill(char) },
    });
  }

  return recommendations;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function renderPracticeRecommendations(container, note, summary, onPractice, onNextLesson, nextLessonLabel = "Try the next lesson") {
  const recommendations = buildPracticeRecommendations(summary);
  if (!recommendations.length) {
    note.textContent = summary.fingerCheckAvailable
      ? "No clear weak spot showed up in this lesson. Keep the momentum going."
      : "No key mistakes showed up. Camera finger checks were not available this time.";
    const card = element("article", "", "summary-feedback-card is-success");
    card.append(
      element("span", "Nice work", "summary-feedback-label"),
      element("h4", "Your keys stayed on track.", "summary-feedback-title"),
      element("p", "Keep practicing to add a new challenge.", "summary-feedback-detail"),
    );
    const button = element("button", nextLessonLabel, "secondary");
    button.type = "button";
    button.addEventListener("click", onNextLesson);
    card.append(button);
    container.replaceChildren(card);
    return;
  }

  note.textContent = summary.fingerCheckAvailable
    ? "Based on this lesson's attempts. Pick a focused drill, then try the lesson again."
    : "Based on typing errors in this lesson. Camera finger checks were not available.";
  container.replaceChildren(...recommendations.map((item) => {
    const card = element("article", "", `summary-feedback-card is-${item.type}`);
    card.append(
      element("span", item.label, "summary-feedback-label"),
      element("h4", item.title, "summary-feedback-title"),
      element("strong", item.metric, "summary-feedback-metric"),
      element("p", item.detail, "summary-feedback-detail"),
    );
    const button = element("button", item.button, "secondary");
    button.type = "button";
    button.addEventListener("click", () => onPractice(item.drill));
    card.append(button);
    return card;
  }));
}
