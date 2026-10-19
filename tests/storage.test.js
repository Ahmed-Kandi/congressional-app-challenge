import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, createStorage } from "../js/storage.js";
import { HISTORY_LIMIT } from "../js/config.js";

// A tiny in-memory stand-in for localStorage.
function memoryBackend() {
  const data = new Map();
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

// A backend that throws on every call, like a browser that blocks storage.
const throwingBackend = {
  getItem() { throw new Error("SecurityError"); },
  setItem() { throw new Error("QuotaExceededError"); },
  removeItem() { throw new Error("SecurityError"); },
};

test("saves and loads JSON", () => {
  const store = createStorage(memoryBackend());
  assert.equal(store.setJSON("thing", { a: 1, b: [2, 3] }), true);
  assert.deepEqual(store.getJSON("thing", null), { a: 1, b: [2, 3] });
});

test("keys are namespaced so other sites' data on localhost is not touched", () => {
  const backend = memoryBackend();
  createStorage(backend).setJSON("settings", {});
  assert.deepEqual([...backend.data.keys()], ["typingFormCoach.settings"]);
});

test("missing keys return the fallback", () => {
  assert.equal(createStorage(memoryBackend()).getJSON("nope", "fallback"), "fallback");
});

test("corrupted JSON returns the fallback instead of throwing", () => {
  const backend = memoryBackend();
  backend.setItem("typingFormCoach.settings", "{not json");
  assert.deepEqual(createStorage(backend).getJSON("settings", { ok: true }), { ok: true });
});

test("a throwing backend never throws out of the wrapper", () => {
  const store = createStorage(throwingBackend);
  assert.equal(store.getJSON("x", 5), 5);
  assert.equal(store.setJSON("x", 1), false);
  assert.doesNotThrow(() => store.remove("x"));
  assert.deepEqual(store.loadSettings(), DEFAULT_SETTINGS);
  assert.deepEqual(store.loadHistory(), []);
  assert.doesNotThrow(() => store.addToHistory({ wpm: 1 }));
});

test("no backend at all (null) works too", () => {
  const store = createStorage(null);
  assert.equal(store.setJSON("x", 1), false);
  assert.equal(store.getJSON("x", 2), 2);
});

test("settings: defaults, then merged with what was saved", () => {
  const store = createStorage(memoryBackend());
  assert.deepEqual(store.loadSettings(), { mirrored: false, cameraFacing: "above" });
  store.saveSettings({ mirrored: true });
  assert.deepEqual(store.loadSettings(), { mirrored: true, cameraFacing: "above" });
});

test("history keeps the newest 10, newest first", () => {
  const store = createStorage(memoryBackend());
  for (let i = 1; i <= 13; i += 1) store.addToHistory({ session: i });
  const history = store.loadHistory();
  assert.equal(HISTORY_LIMIT, 10);
  assert.equal(history.length, 10);
  assert.deepEqual(history.map((entry) => entry.session), [13, 12, 11, 10, 9, 8, 7, 6, 5, 4]);
});

test("history that is not an array is treated as empty", () => {
  const backend = memoryBackend();
  backend.setItem("typingFormCoach.history", JSON.stringify({ oops: true }));
  assert.deepEqual(createStorage(backend).loadHistory(), []);
});

test("remove deletes a key", () => {
  const store = createStorage(memoryBackend());
  store.setJSON("calibration", { a: 1 });
  store.remove("calibration");
  assert.equal(store.getJSON("calibration", null), null);
});
