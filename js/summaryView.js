// Draws the Summary screen and the session history with plain HTML (no chart library).

import { HEADLINE_KEYSTROKE_SHARE } from "./config.js";
import { LEVELS } from "./exercises.js";
import { FINGERS, FINGER_LABELS, describeFingers, expectedFingers, fingerLabel, isFingerId } from "./fingerMap.js";

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
    fingerAccuracyByFinger: summary.fingerAccuracyByFinger,
    fingerErrorsByKey: summary.fingerErrorsByKey,
    fingerPaceByFinger: summary.fingerPaceByFinger,
    fingersFor90Percent: summary.fingersFor90Percent,
  };
}

/** Ranked transition times from correctly typed, camera-checked presses. */
export function fastestFingersFromHistory(history, minimumPresses = 3) {
  const totals = Object.fromEntries(FINGERS.map((finger) => [finger, { totalMs: 0, count: 0 }]));
  for (const entry of history) {
    for (const finger of FINGERS) {
      const pace = entry.fingerPaceByFinger?.[finger];
      if (!pace || !Number.isFinite(pace.totalMs) || !Number.isFinite(pace.count)
        || pace.totalMs <= 0 || pace.count <= 0) continue;
      totals[finger].totalMs += pace.totalMs;
      totals[finger].count += pace.count;
    }
  }
  return FINGERS.flatMap((finger) => {
    const { totalMs, count } = totals[finger];
    return count >= minimumPresses ? [{ finger, count, averageMs: totalMs / count }] : [];
  }).sort((a, b) => a.averageMs - b.averageMs || b.count - a.count).slice(0, 3);
}

export function renderDashboardFastestFingers(container, note, history) {
  const fastest = fastestFingersFromHistory(history);
  if (!fastest.length) {
    container.replaceChildren(element("p", "Finish a few camera-checked lessons to see your quickest fingers here.", "hint"));
    note.textContent = "Finger speed appears after at least three timed presses for a finger.";
    return;
  }
  const list = element("ol", null, "dashboard-fastest-list");
  fastest.forEach(({ finger, count, averageMs }, index) => {
    const row = element("li", null, "dashboard-fastest-row");
    row.append(
      element("span", String(index + 1).padStart(2, "0"), "dashboard-fastest-rank"),
      element("strong", FINGER_LABELS[finger], "dashboard-fastest-name"),
      element("span", `${Math.round(averageMs)} ms / key`, "dashboard-fastest-time"),
      element("small", `${count} timed presses`, "dashboard-fastest-count"),
    );
    list.append(row);
  });
  container.replaceChildren(list);
  note.textContent = "Average time from one correct key to the next, grouped by the finger that pressed it. Lower is faster.";
}

/** Physical keys most often pressed with a finger other than their assigned one. */
export function mostMissedKeysFromHistory(history, limit = 4) {
  const totals = new Map();
  for (const entry of history) {
    for (const [code, saved] of Object.entries(entry?.fingerErrorsByKey ?? {})) {
      if (!saved || !Number.isFinite(saved.total) || !Number.isFinite(saved.wrong)
        || saved.total <= 0 || saved.wrong < 0 || saved.wrong > saved.total) continue;
      const stats = totals.get(code) ?? { code, label: saved.label || code, wrong: 0, total: 0, usedCounts: {} };
      stats.wrong += saved.wrong;
      stats.total += saved.total;
      for (const [finger, count] of Object.entries(saved.usedCounts ?? {})) {
        if (isFingerId(finger) && Number.isFinite(count) && count > 0) {
          stats.usedCounts[finger] = (stats.usedCounts[finger] ?? 0) + count;
        }
      }
      totals.set(code, stats);
    }
  }
  return [...totals.values()]
    .filter((stats) => stats.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || b.wrong / b.total - a.wrong / a.total || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function renderDashboardMissedKeys(container, note, history) {
  const keys = mostMissedKeysFromHistory(history);
  if (!keys.length) {
    container.replaceChildren(element("p", "No wrong-finger key patterns yet. Finish a camera-checked lesson to build this view.", "hint"));
    note.textContent = "Only correct keys pressed with a different finger count here.";
    return;
  }
  container.replaceChildren(...keys.map(({ code, label, wrong, total, usedCounts }) => {
    const card = element("article", null, "dashboard-missed-card");
    const keycap = element("kbd", label, "dashboard-missed-keycap");
    const copy = element("div", null, "dashboard-missed-copy");
    const expected = describeFingers(expectedFingers(code));
    copy.append(
      element("h3", `${wrong} wrong-finger ${wrong === 1 ? "press" : "presses"}`, "dashboard-missed-count"),
      element("p", `${wrong} of ${total} camera-checked presses · use ${expected || "the assigned finger"}`, "dashboard-missed-detail"),
    );
    const common = Object.entries(usedCounts).sort((a, b) => b[1] - a[1])[0];
    if (common) copy.append(element("small", `Most often used ${fingerLabel(common[0])} instead`, "dashboard-missed-used"));
    card.append(keycap, copy);
    return card;
  }));
  note.textContent = "Ranked by wrong-finger presses across your recent saved lessons. Ordinary key typos are excluded.";
}

/** Render recent, camera-checked accuracy beside simple left and right hand models. */
export function renderDashboardFingerAccuracy(container, note, history) {
  const totals = Object.fromEntries(FINGERS.map((finger) => [finger, { correct: 0, total: 0 }]));
  for (const entry of history) {
    for (const finger of FINGERS) {
      const saved = entry.fingerAccuracyByFinger?.[finger];
      if (!saved || !Number.isFinite(saved.correct) || !Number.isFinite(saved.total)) continue;
      totals[finger].correct += saved.correct;
      totals[finger].total += saved.total;
    }
  }

  const hands = [
    { side: "L", label: "Left hand", fingers: FINGERS.filter((finger) => finger.startsWith("L_")) },
    { side: "R", label: "Right hand", fingers: FINGERS.filter((finger) => finger.startsWith("R_")) },
  ];
  container.replaceChildren(...hands.map(({ side, label, fingers }) => {
    const card = element("article", null, "dashboard-hand-card");
    const title = element("h3", label);
    const model = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    model.setAttribute("viewBox", "0 0 100 112");
    model.setAttribute("role", "img");
    model.setAttribute("aria-label", `Model of the ${label.toLowerCase()}`);
    model.classList.add("dashboard-hand-model");
    const art = document.createElementNS("http://www.w3.org/2000/svg", "g");
    art.classList.add("dashboard-hand-art");
    if (side === "R") art.classList.add("is-right-hand");
    const handPath = "M30 104C27 100 26 95 24 89L10 59C7 52 10 46 15 44C20 42 24 46 27 52L32 63L23 23C22 17 25 12 30 11C36 10 39 14 40 20L46 53L43 14C42 8 46 4 52 4C58 4 61 8 61 14L62 52L63 20C63 14 67 11 72 12C78 13 80 18 79 24L76 57L80 35C81 29 85 26 90 28C95 30 96 35 94 41L85 76C84 82 86 89 83 96C81 102 76 105 69 105H39C35 105 32 105 30 104Z";
    const handOutline = document.createElementNS("http://www.w3.org/2000/svg", "path");
    handOutline.setAttribute("d", handPath);
    handOutline.setAttribute("class", "hero-hand-outline");
    const handEdge = document.createElementNS("http://www.w3.org/2000/svg", "path");
    handEdge.setAttribute("d", handPath);
    handEdge.setAttribute("class", "hero-hand-outline-top");
    art.append(handOutline, handEdge);
    const sideMark = document.createElementNS("http://www.w3.org/2000/svg", "text");
    sideMark.setAttribute("x", "50");
    sideMark.setAttribute("y", "91");
    sideMark.setAttribute("class", "dashboard-hand-side");
    sideMark.textContent = side;
    model.append(art, sideMark);

    const rows = element("ul", null, "dashboard-finger-list");
    for (const finger of fingers) {
      const stats = totals[finger];
      const fraction = stats.total > 0 ? stats.correct / stats.total : null;
      const row = element("li", null, "dashboard-finger-stat");
      row.dataset.finger = finger;
      row.setAttribute("aria-label", `${FINGER_LABELS[finger]}: ${formatPercent(fraction)}, ${Math.round(stats.total)} camera checks`);
      row.append(element("span", FINGER_LABELS[finger].replace(`${label.split(" ")[0].toLowerCase()} `, ""), "dashboard-finger-name"));
      const track = element("span", null, "dashboard-finger-track");
      track.setAttribute("aria-hidden", "true");
      const fill = element("span", null, "dashboard-finger-fill");
      fill.style.width = `${fraction == null ? 0 : fraction * 100}%`;
      track.append(fill);
      row.append(track, element("strong", formatPercent(fraction), "dashboard-finger-value"));
      rows.append(row);
    }
    card.append(title, model, rows);
    return card;
  }));

  const hasStats = FINGERS.some((finger) => totals[finger].total > 0);
  note.textContent = hasStats
    ? "Based on camera checks from your recent saved practice sessions. A dash means that finger has not been checked yet."
    : "Finish a camera-checked practice session to see accuracy for each finger.";
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
