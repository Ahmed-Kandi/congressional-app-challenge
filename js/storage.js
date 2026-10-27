// Small wrapper around localStorage.
// localStorage can throw (private browsing, storage full, blocked by school
// policy), and even reading the `localStorage` property can throw. Every access
// is wrapped in try/catch so the app keeps working, it just forgets things.

import { HISTORY_LIMIT } from "./config.js";

const PREFIX = "typingFormCoach.";

export const KEYS = {
  settings: "settings",
  cameraDeviceId: "cameraDeviceId",
  cameraSetupCompleted: "cameraSetupCompleted",
  calibration: "calibration",
  history: "history",
  typingTestResults: "typingTestResults",
  exerciseProgress: "exerciseProgress",
};

export const DEFAULT_SETTINGS = {
  mirrored: false,
  cameraFacing: "above", // "above" (above keyboard looking down) or "behind" (behind keyboard looking at user)
  flipView: true, // Display only: turn the picture around so the hands face the typist.
  // The camera itself is upside down ("Rotate view 180°" in Setup). Unlike
  // flipView this changes which hand is "L", so it is saved and stays put.
  rotated: false,
};

// Find localStorage without letting a SecurityError escape.
function defaultBackend() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Create a storage object. Tests pass a fake backend; the app uses localStorage.
 * @param {Storage|null} backend  anything with getItem, setItem, removeItem
 */
export function createStorage(backend = defaultBackend()) {
  function getJSON(key, fallback) {
    try {
      const text = backend?.getItem(PREFIX + key);
      return text == null ? fallback : JSON.parse(text);
    } catch {
      return fallback; // missing backend, blocked access, or corrupted JSON
    }
  }

  /** Returns true if saved, false if storage refused. */
  function setJSON(key, value) {
    try {
      if (!backend) return false;
      backend.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function remove(key) {
    try {
      backend?.removeItem(PREFIX + key);
    } catch {
      // Nothing useful to do; the value just stays.
    }
  }

  function loadSettings() {
    const saved = getJSON(KEYS.settings, {});
    // Merge so a setting added in a later version still gets its default.
    return { ...DEFAULT_SETTINGS, ...(saved && typeof saved === "object" ? saved : {}) };
  }

  function saveSettings(settings) {
    return setJSON(KEYS.settings, settings);
  }

  function loadHistory() {
    const history = getJSON(KEYS.history, []);
    return Array.isArray(history) ? history : [];
  }

  /** Add a session summary to the front of the history, keeping the newest HISTORY_LIMIT. */
  function addToHistory(summary) {
    const history = [summary, ...loadHistory()].slice(0, HISTORY_LIMIT);
    setJSON(KEYS.history, history);
    return history;
  }

  return { getJSON, setJSON, remove, loadSettings, saveSettings, loadHistory, addToHistory };
}

// The shared instance the app uses.
export const storage = createStorage();
