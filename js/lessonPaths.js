// The existing exercises, arranged as eight visual paths. The exercise IDs
// stay the same so saved progress and lesson content still work.

import { LEVELS } from "./exercises.js";

export const LESSON_PATHS = [
  { title: "Home position", description: "Find the anchor keys for your index and middle fingers.", levelId: 1, start: 0, end: 2 },
  { title: "Outer fingers", description: "Bring ring fingers and pinkies into the pattern.", levelId: 1, start: 2, end: 4 },
  { title: "The whole home row", description: "Use every home key, then reach for G and H.", levelId: 1, start: 4, end: 6 },
  { title: "Hand coordination", description: "Travel across the row and alternate between hands.", levelId: 1, start: 6, end: 8 },
  { title: "First words", description: "Turn familiar keys into words and short sentences.", levelId: 2, start: 0, end: 4 },
  { title: "Word rhythm", description: "Practice longer words, punctuation, and repeated patterns.", levelId: 2, start: 4, end: 8 },
  { title: "Sentence basics", description: "Write complete sentences with capitals and punctuation.", levelId: 3, start: 0, end: 5 },
  { title: "Fluent writing", description: "Build a steady flow through varied sentences.", levelId: 3, start: 5, end: 10 },
];

const SENTENCE_TITLES = [
  "Robotics club", "Before the quiz", "Bus ride home", "Relaxed wrists", "Library hours",
  "Science fair", "Essay practice", "Glaciers and valleys", "Daily practice", "Jazz night",
];

function element(tag, className, value) {
  const node = document.createElement(tag);
  node.className = className;
  if (value != null) node.textContent = value;
  return node;
}

function completedCount(progress, level) {
  const count = Number(progress[level.id]);
  return Number.isFinite(count) ? Math.max(0, Math.min(level.items.length, Math.floor(count))) : 0;
}

export function renderLessonPaths(container, { progress, onSelect }) {
  const levels = new Map(LEVELS.map((level) => [level.id, level]));
  container.replaceChildren(...LESSON_PATHS.map((path, pathIndex) => {
    const level = levels.get(path.levelId);
    const completed = completedCount(progress, level);
    const section = element("section", "lesson-pathway");
    const headingId = `${container.id}-path-${pathIndex + 1}`;
    section.setAttribute("aria-labelledby", headingId);

    const header = element("header", "lesson-pathway-header");
    header.append(
      element("span", "lesson-pathway-number", `PATH ${String(pathIndex + 1).padStart(2, "0")} / ${String(LESSON_PATHS.length).padStart(2, "0")}`),
    );
    const title = element("h3", "lesson-pathway-title", path.title);
    title.id = headingId;
    const doneInPath = Math.max(0, Math.min(path.end - path.start, completed - path.start));
    header.append(title, element("p", "lesson-pathway-description", path.description),
      element("span", "lesson-pathway-count", `${doneInPath} of ${path.end - path.start} complete`));

    const steps = element("ol", "lesson-pathway-steps");
    for (let exerciseIndex = path.start; exerciseIndex < path.end; exerciseIndex += 1) {
      const ordinal = exerciseIndex - path.start + 1;
      const lessonTitle = level.tutorials?.[exerciseIndex]?.title ?? SENTENCE_TITLES[exerciseIndex] ?? `Sentence ${exerciseIndex + 1}`;
      const status = exerciseIndex < completed ? "done" : exerciseIndex === completed ? "current" : "upcoming";
      const item = element("li", "lesson-path-step");
      const button = element("button", "level-card lesson-path-button");
      button.type = "button";
      button.dataset.state = status;
      button.setAttribute("aria-label", `${lessonTitle}, path ${pathIndex + 1}, lesson ${ordinal} of ${path.end - path.start}${status === "done" ? ", completed" : ""}`);
      const circle = element("span", "lesson-path-node", status === "done" ? "✓" : String(ordinal));
      circle.setAttribute("aria-hidden", "true");
      const copy = element("span", "lesson-path-copy");
      copy.append(element("strong", "lesson-path-name", lessonTitle),
        element("small", "lesson-path-detail", `Exercise ${exerciseIndex + 1} of ${level.items.length}`));
      button.append(circle, copy);
      button.addEventListener("click", () => onSelect(path.levelId, exerciseIndex));
      item.append(button);
      steps.append(item);
    }

    section.append(header, steps);
    return section;
  }));
}
