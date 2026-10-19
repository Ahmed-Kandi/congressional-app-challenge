// Draws the Summary screen and the session history with plain HTML (no chart library).

import { HEADLINE_KEYSTROKE_SHARE } from "./config.js";
import { LEVELS } from "./exercises.js";

export function formatPercent(fraction) {
  return fraction == null ? "--" : `${Math.round(fraction * 100)}%`;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

/** The one-line headline at the top of the summary. */
export function headlineText(summary) {
  if (summary.fingersFor90Percent == null) {
    return "Finger check was not available this time, so the chart below shows which fingers your keys call for.";
  }
  const n = summary.fingersFor90Percent;
  return `You used ${n} finger${n === 1 ? "" : "s"} for ${Math.round(HEADLINE_KEYSTROKE_SHARE * 100)} percent of your keystrokes.`;
}

/**
 * Bar chart of keystrokes per finger. Each bar shows its number and name in
 * text, and the whole chart has a text description for screen readers.
 */
export function renderHistogram(container, bars) {
  const max = Math.max(1, ...bars.map((bar) => bar.count));
  container.replaceChildren(
    ...bars.map((bar) => {
      const column = element("div", null, "histogram-bar");
      const fill = element("div", null, "bar");
      fill.style.height = `${(bar.count / max) * 100}%`;
      column.append(element("span", String(bar.count), "count"), fill, element("span", bar.label, "label"));
      return column;
    }),
  );
  container.setAttribute(
    "aria-label",
    `Keystrokes per finger: ${bars.map((bar) => `${bar.label} ${bar.count}`).join(", ")}.`,
  );
}

function renderSubstitutions(container, summary) {
  if (!summary.fingerCheckAvailable) {
    container.replaceChildren(element("p", "Not available: the finger check did not run this session.", "hint"));
    return;
  }
  if (summary.topSubstitutions.length === 0) {
    container.replaceChildren(element("p", "None. Every checked keystroke used the right finger."));
    return;
  }
  const table = element("table");
  const head = element("tr");
  head.append(element("th", "Should have used"), element("th", "Actually used"), element("th", "Times"));
  table.append(head);
  for (const row of summary.topSubstitutions) {
    const tr = element("tr");
    tr.append(element("td", row.expected), element("td", row.used), element("td", String(row.count)));
    table.append(tr);
  }
  container.replaceChildren(table);
}

/**
 * Fill in the Summary screen.
 * @param {object} el  { headline, wpm, charAccuracy, fingerAccuracy, histogram, histogramNote, substitutions }
 * @param {object} summary  from TypingSession.summary()
 */
export function renderSummary(el, summary) {
  el.headline.textContent = headlineText(summary);
  el.wpm.textContent = `${Math.round(summary.wpm)} WPM`;
  el.charAccuracy.textContent = formatPercent(summary.charAccuracy);
  el.fingerAccuracy.textContent = summary.fingerAccuracy == null ? "not available" : formatPercent(summary.fingerAccuracy);
  el.histogramNote.textContent = summary.fingerCheckAvailable
    ? "Which finger the camera saw pressing each key."
    : "Based on the keys you pressed (which finger should press each one), because the finger check was not available.";
  renderHistogram(el.histogram, summary.histogram);
  renderSubstitutions(el.substitutions, summary);
}

/** What gets saved to history for one session (small, no keystroke details). */
export function historyEntry(summary, date = new Date()) {
  return {
    date: date.toISOString(),
    levelId: summary.levelId,
    exerciseIndex: summary.exerciseIndex,
    wpm: Math.round(summary.wpm),
    charAccuracy: summary.charAccuracy,
    fingerAccuracy: summary.fingerAccuracy,
    fingersFor90Percent: summary.fingersFor90Percent,
  };
}

/** Table of past sessions, newest first. */
export function renderHistory(container, history) {
  if (history.length === 0) {
    container.replaceChildren(element("p", "No sessions yet. Finish an exercise to see it here.", "hint"));
    return;
  }
  const table = element("table");
  const head = element("tr");
  for (const title of ["When", "Exercise", "WPM", "Accuracy", "Finger accuracy"]) head.append(element("th", title));
  table.append(head);
  for (const entry of history) {
    const level = LEVELS.find((l) => l.id === entry.levelId);
    const tr = element("tr");
    tr.append(
      element("td", new Date(entry.date).toLocaleString([], { dateStyle: "short", timeStyle: "short" })),
      element("td", level ? `Level ${level.id}, #${(entry.exerciseIndex ?? 0) + 1}` : "Other"),
      element("td", String(entry.wpm)),
      element("td", formatPercent(entry.charAccuracy)),
      element("td", entry.fingerAccuracy == null ? "not available" : formatPercent(entry.fingerAccuracy)),
    );
    table.append(tr);
  }
  container.replaceChildren(table);
}
