// App bootstrap and screen state machine.
// Screens: setup -> calibrate -> choose -> exercise -> summary (and back).
// main.js wires modules together; the real work lives in the other files.

import {
  ATTRIBUTION_DELAY_MS,
  LIVE_STATS_INTERVAL_MS,
  LOW_FPS_GRACE_MS,
  LOW_FPS_THRESHOLD,
  SETUP_BOTH_HANDS_REQUIRED_MS,
} from "./config.js";
import {
  CameraError,
  cameraAllowedHere,
  closeCamera,
  deviceIdOf,
  fillCameraPicker,
  listCameras,
  openCamera,
  rememberCamera,
  rememberedCamera,
} from "./camera.js";
import { ATTRIBUTION_IMPLEMENTED, attributeKeystroke } from "./core/fingerAttribution.js";
import { createCalibrationScreen, loadCalibration } from "./calibration.js";
import { LEVELS, getExerciseText } from "./exercises.js";
import { evaluateAttribution, runAttribution, showFingerCheck } from "./feedback.js";
import { Recorder, downloadRecording } from "./debug/recorder.js";
import { createReplayer, parseRecording } from "./debug/replay.js";
import { createTraceStore, describeSnapshot, drawTraces, renderLegend } from "./debug/traces.js";
import { describeFingers, expectedFingersForChar, needsShift } from "./fingerMap.js";
import { FrameBuffer } from "./frameBuffer.js";
import { HandTracker } from "./handTracker.js";
import { startKeyboardCapture } from "./keyboard.js";
import { Overlay } from "./overlay.js";
import { createPipeline } from "./pipeline.js";
import { TypingSession } from "./session.js";
import { KEYS, storage } from "./storage.js";

// ---------- Element lookup ----------

const $ = (id) => document.getElementById(id);

const ui = {
  globalError: $("global-error"),
  trackingWarning: $("tracking-warning"),
  stage: $("stage"),
  video: $("camera-video"),
  overlayCanvas: $("overlay-canvas"),
  // setup
  setupError: $("setup-error"),
  setupNotice: $("setup-notice"),
  cameraPicker: $("camera-picker"),
  mirroredToggle: $("mirrored-toggle"),
  facingRadios: document.querySelectorAll('input[name="camera-facing"]'),
  indicatorLeft: $("indicator-left"),
  indicatorRight: $("indicator-right"),
  setupFps: $("setup-fps"),
  positioningTip: $("positioning-tip"),
  setupStatus: $("setup-status"),
  setupContinue: $("setup-continue"),
  setupSkipCamera: $("setup-skip-camera"),
  // calibrate
  calibrateCountdown: $("calibrate-countdown"),
  calibrateProgress: $("calibrate-progress"),
  calibrateStatus: $("calibrate-status"),
  calibrateStart: $("calibrate-start"),
  calibrateSkip: $("calibrate-skip"),
  // choose
  levelList: $("level-list"),
  chooseBackSetup: $("choose-back-setup"),
  chooseRecalibrate: $("choose-recalibrate"),
  historyChoose: $("history-choose"),
  // exercise
  exerciseTitle: $("exercise-title"),
  attributionBadge: $("attribution-badge"),
  replayBadge: $("replay-badge"),
  typingArea: $("typing-area"),
  targetText: $("target-text"),
  nextFinger: $("next-finger"),
  feedbackText: $("feedback-text"),
  liveWpm: $("live-wpm"),
  liveAccuracy: $("live-accuracy"),
  liveTyped: $("live-typed"),
  exerciseQuit: $("exercise-quit"),
  // summary
  summaryWpm: $("summary-wpm"),
  summaryCharAccuracy: $("summary-char-accuracy"),
  summaryFingerAccuracy: $("summary-finger-accuracy"),
  summaryAgain: $("summary-again"),
  summaryChoose: $("summary-choose"),
  // debug
  debugToggle: $("debug-toggle"),
  debugPanel: $("debug-panel"),
  debugFps: $("debug-fps"),
  debugTimestampSource: $("debug-timestamp-source"),
  debugLag: $("debug-lag"),
  debugBufferSize: $("debug-buffer-size"),
  debugDelegate: $("debug-delegate"),
  debugSource: $("debug-source"),
  debugLastAttribution: $("debug-last-attribution"),
  debugRecord: $("debug-record"),
  debugStop: $("debug-stop"),
  debugRecordStatus: $("debug-record-status"),
  debugLoad: $("debug-load"),
  debugReplayStatus: $("debug-replay-status"),
  traceSelect: $("trace-select"),
  traceRelative: $("trace-relative"),
  traceCanvas: $("trace-canvas"),
  traceLegend: $("trace-legend"),
};

// ---------- Shared state ----------

const params = new URLSearchParams(location.search);
// Testing only: jump straight into an exercise without the camera.
const skipSetup = params.get("skipSetup") === "1";

const state = {
  screen: null,
  settings: storage.loadSettings(),
  stream: null,
  tracker: null,
  trackerReady: false,
  bothHandsSince: null,
  session: null,
  exerciseActive: false,
  targetSpans: [],
  lastSummary: null,
  calibration: loadCalibration(),
  pendingFingerChecks: 0,
  fingerCheckWaiters: [],
};

const frameBuffer = new FrameBuffer();
const pipeline = createPipeline({ frameBuffer });
const overlay = new Overlay(ui.overlayCanvas, ui.video);

// ---------- Screens ----------

const STAGE_SLOTS = {
  setup: "setup-stage-slot",
  calibrate: "calibrate-stage-slot",
  exercise: "exercise-stage-slot",
};

function showScreen(name) {
  state.screen = name;
  for (const section of document.querySelectorAll(".screen")) {
    section.hidden = section.dataset.screen !== name;
  }
  // Move the one live video into this screen's slot (if it has one).
  const slotId = STAGE_SLOTS[name];
  if (slotId) {
    $(slotId).append(ui.stage);
    ui.video.play().catch(() => {}); // moving a video can pause it in some browsers
  } else {
    document.body.append(ui.stage);
  }
  screenEnterHandlers[name]?.();
}

const screenEnterHandlers = {};

// ---------- Messages ----------

function showMessage(element, text) {
  element.textContent = text;
  element.hidden = !text;
}

const CAMERA_ERROR_TEXT = {
  insecure:
    "The camera needs a secure page. Open this app from an https:// address or from http://localhost (run `npm run serve`).",
  unsupported: "This browser cannot use a camera. Try Chrome on a Chromebook, Mac, or Windows computer.",
  denied:
    "Camera permission was denied. Click the camera icon in the address bar, choose Allow, then reload the page.",
  notFound:
    "No camera was found. Plug in a webcam, or connect your iPhone with Continuity Camera, then reload the page.",
  inUse: "The camera is busy. Close other apps or tabs that use the camera (like video calls), then reload.",
  unknown: "The camera could not start.",
};

// ---------- Camera ----------

async function startCamera(deviceId) {
  closeCamera(state.stream);
  state.stream = null;
  showMessage(ui.setupError, "");
  ui.setupStatus.textContent = "Starting camera...";
  try {
    state.stream = await openCamera(deviceId);
  } catch (error) {
    const kind = error instanceof CameraError ? error.kind : "unknown";
    const extra = kind === "unknown" ? ` (${error.message})` : "";
    showMessage(ui.setupError, CAMERA_ERROR_TEXT[kind] + extra);
    ui.setupStatus.textContent = "Camera is off.";
    fillCameraPicker(ui.cameraPicker, await listCameras().catch(() => []), null);
    return;
  }
  ui.video.srcObject = state.stream;
  ui.stage.classList.add("has-video");
  await ui.video.play().catch(() => {});
  const activeId = deviceIdOf(state.stream);
  rememberCamera(activeId);
  fillCameraPicker(ui.cameraPicker, await listCameras(), activeId);
  ui.setupStatus.textContent = state.trackerReady ? "Tracking hands." : "Camera on. Loading hand tracking...";
}

// ---------- Hand tracking ----------

async function startTracking() {
  state.tracker = new HandTracker({
    video: ui.video,
    getSettings: () => state.settings,
    onFrame: (frame) => pipeline.ingestFrame(frame, "live"),
  });
  try {
    const { delegate, gpuProblem } = await state.tracker.load();
    ui.debugDelegate.textContent = delegate;
    if (gpuProblem) {
      showMessage(ui.setupNotice, `${gpuProblem} Hand tracking is running on the CPU instead, which is slower.`);
    }
  } catch (error) {
    showMessage(
      ui.setupError,
      `The hand tracking model failed to load. Check your internet connection and reload. (${error.message})`,
    );
    ui.setupStatus.textContent = "Hand tracking is unavailable.";
    return;
  }
  state.trackerReady = true;
  state.tracker.start();
  if (state.stream) ui.setupStatus.textContent = "Tracking hands.";
}

// Watch fps once per second; warn if tracking is too slow to trust.
function checkFps() {
  const tracker = state.tracker;
  if (!tracker?.running || pipeline.source !== "live" || !state.stream) {
    showMessage(ui.trackingWarning, "");
    return;
  }
  const warmedUp = performance.now() - tracker.stats.startedAt > LOW_FPS_GRACE_MS;
  const slow = warmedUp && tracker.stats.fps < LOW_FPS_THRESHOLD;
  showMessage(
    ui.trackingWarning,
    slow
      ? `Hand tracking is slow (${tracker.stats.fps.toFixed(0)} fps, below ${LOW_FPS_THRESHOLD}). Finger checks may be unreliable. Close other tabs or apps to speed it up.`
      : "",
  );
}

// ---------- Setup screen ----------

function applySettingsToControls() {
  ui.mirroredToggle.checked = state.settings.mirrored;
  for (const radio of ui.facingRadios) radio.checked = radio.value === state.settings.cameraFacing;
}

function updateSetting(name, value) {
  state.settings = { ...state.settings, [name]: value };
  storage.saveSettings(state.settings);
}

function setIndicator(element, on) {
  element.dataset.on = String(on);
}

function positioningTip(hasLeft, hasRight) {
  if (!state.stream) return "Turn on a camera to begin.";
  if (!state.trackerReady) return "Waiting for hand tracking to load...";
  if (!hasLeft && !hasRight) return "Put both hands on the keyboard where the camera can see them.";
  if (!hasLeft || !hasRight) {
    return "Only one hand is visible. Move the camera back or tilt it so both hands and the whole keyboard fit.";
  }
  return "Both hands visible. Keep them in view while you type.";
}

function updateSetupIndicators(frame) {
  const hasLeft = frame.hands.some((hand) => hand.side === "L");
  const hasRight = frame.hands.some((hand) => hand.side === "R");
  setIndicator(ui.indicatorLeft, hasLeft);
  setIndicator(ui.indicatorRight, hasRight);
  ui.positioningTip.textContent = positioningTip(hasLeft, hasRight);

  // Continue unlocks after both hands stay visible for a full second.
  if (hasLeft && hasRight) {
    state.bothHandsSince ??= frame.t;
    if (frame.t - state.bothHandsSince >= SETUP_BOTH_HANDS_REQUIRED_MS) ui.setupContinue.disabled = false;
  } else {
    state.bothHandsSince = null;
  }
}

function initSetupScreen() {
  applySettingsToControls();
  ui.mirroredToggle.addEventListener("change", () => updateSetting("mirrored", ui.mirroredToggle.checked));
  for (const radio of ui.facingRadios) {
    radio.addEventListener("change", () => radio.checked && updateSetting("cameraFacing", radio.value));
  }
  ui.cameraPicker.addEventListener("change", () => startCamera(ui.cameraPicker.value));
  ui.setupContinue.addEventListener("click", () => showScreen("calibrate"));
  ui.setupSkipCamera.addEventListener("click", () => showScreen("choose"));
}

// ---------- Calibrate screen ----------

let calibrationScreen = null;

function initCalibrateScreen() {
  calibrationScreen = createCalibrationScreen({
    elements: {
      countdown: ui.calibrateCountdown,
      progress: ui.calibrateProgress,
      status: ui.calibrateStatus,
      startButton: ui.calibrateStart,
    },
    pipeline,
    onSuccess: (calibration) => {
      state.calibration = calibration;
      showScreen("choose");
    },
  });
  screenEnterHandlers.calibrate = () => {
    calibrationScreen.reset();
    ui.calibrateStatus.textContent = state.calibration
      ? "A saved calibration exists. Calibrate again, or skip to keep using it."
      : "Ready when you are.";
  };
  ui.calibrateStart.addEventListener("click", () => calibrationScreen.start());
  ui.calibrateSkip.addEventListener("click", () => showScreen("choose"));
}

// ---------- Choose screen ----------

function exerciseProgress() {
  const progress = storage.getJSON(KEYS.exerciseProgress, {});
  return progress && typeof progress === "object" ? progress : {};
}

function nextExerciseIndex(levelId) {
  return Number(exerciseProgress()[levelId] ?? 0);
}

function advanceExerciseIndex(levelId, finishedIndex) {
  storage.setJSON(KEYS.exerciseProgress, { ...exerciseProgress(), [levelId]: finishedIndex + 1 });
}

function renderLevelList() {
  ui.levelList.replaceChildren(
    ...LEVELS.map((level) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "level-card";
      const index = nextExerciseIndex(level.id) % level.items.length;
      const title = document.createElement("strong");
      title.textContent = level.title;
      const description = document.createElement("span");
      description.textContent = `${level.description} Exercise ${index + 1} of ${level.items.length}.`;
      button.append(title, description);
      button.addEventListener("click", () => startExercise(level.id, index));
      return button;
    }),
  );
}

function initChooseScreen() {
  screenEnterHandlers.choose = () => {
    renderLevelList();
    renderHistory(ui.historyChoose);
  };
  ui.chooseBackSetup.addEventListener("click", () => showScreen("setup"));
  ui.chooseRecalibrate.addEventListener("click", () => showScreen("calibrate"));
}

// ---------- Exercise screen ----------

function startExercise(levelId, exerciseIndex) {
  const title = `${LEVELS.find((l) => l.id === levelId).title}, exercise ${exerciseIndex + 1}`;
  startExerciseWithText(getExerciseText(levelId, exerciseIndex), { levelId, exerciseIndex }, title);
}

function startExerciseWithText(text, info, title) {
  state.session = new TypingSession(text, info);
  state.exerciseActive = true;
  ui.exerciseTitle.textContent = title;
  ui.replayBadge.hidden = pipeline.source !== "replay";
  ui.attributionBadge.hidden = ATTRIBUTION_IMPLEMENTED;
  overlay.clearFlash();
  renderTargetText();
  setFeedback("Start typing when ready.", "idle");
  updateExerciseDisplay();
  showScreen("exercise");
  ui.typingArea.focus();
}

function renderTargetText() {
  state.targetSpans = [...state.session.targetText].map((char) => {
    const span = document.createElement("span");
    span.textContent = char;
    return span;
  });
  ui.targetText.replaceChildren(...state.targetSpans);
}

function updateTargetText() {
  const { typed, position } = state.session;
  state.targetSpans.forEach((span, index) => {
    if (index < position) span.className = typed[index].correct ? "char-correct" : "char-wrong";
    else span.className = index === position ? "char-current" : "char-pending";
  });
}

function nextFingerText(char) {
  if (char == null) return "Done!";
  const fingers = expectedFingersForChar(char);
  if (fingers.length === 0) return "Next: any finger";
  let text = `Next: ${describeFingers(fingers)}`;
  if (needsShift(char)) {
    // Use the Shift key on the opposite hand from the letter.
    const shiftHand = fingers[0].startsWith("L_") ? "right" : "left";
    text += ` + ${shiftHand} pinky on Shift`;
  }
  return text;
}

function formatPercent(fraction) {
  return fraction == null ? "--" : `${Math.round(fraction * 100)}%`;
}

function updateLiveStats() {
  if (!state.session) return;
  const stats = state.session.liveStats(performance.now());
  ui.liveWpm.textContent = stats.wpm.toFixed(0);
  ui.liveAccuracy.textContent = stats.accuracy == null ? "100%" : formatPercent(stats.accuracy);
  ui.liveTyped.textContent = `${stats.typedCount} / ${state.session.targetText.length}`;
}

function updateExerciseDisplay() {
  updateTargetText();
  ui.nextFinger.textContent = nextFingerText(state.session.nextChar);
  updateLiveStats();
}

function setFeedback(text, status) {
  ui.feedbackText.textContent = text;
  ui.feedbackText.dataset.status = status;
}

function handleExerciseKey(keyEvent) {
  const session = state.session;
  const keystroke = session.handleKey(keyEvent);
  if (!keystroke) return;
  updateExerciseDisplay();
  scheduleFingerCheck(session, keystroke, keyEvent);
  if (session.isComplete) finishExercise();
}

// ---------- Finger check (calls the team's function) ----------

// Camera frames lag behind key events, so wait ATTRIBUTION_DELAY_MS for the
// frames that show the finger landing on the key, then ask the team's function.
function scheduleFingerCheck(session, keystroke, keyEvent) {
  state.pendingFingerChecks += 1;
  setTimeout(() => {
    try {
      runFingerCheck(session, keystroke, keyEvent);
    } finally {
      state.pendingFingerChecks -= 1;
      if (state.pendingFingerChecks === 0) state.fingerCheckWaiters.splice(0).forEach((resolve) => resolve());
    }
  }, ATTRIBUTION_DELAY_MS);
}

function runFingerCheck(session, keystroke, keyEvent) {
  const { result, problem } = runAttribution(attributeKeystroke, keyEvent, frameBuffer, state.calibration);
  const check = evaluateAttribution(result, keystroke.expectedFingers);
  session.recordFingerCheck(keystroke.id, check);
  ui.debugLastAttribution.textContent = problem ?? (result ? `${result.finger} (${result.confidence.toFixed(2)})` : "null");
  if (problem) console.warn(problem);
  // Only update the screen if this keystroke belongs to the exercise on screen.
  if (session === state.session && state.screen === "exercise") {
    showFingerCheck({ textElement: ui.feedbackText, overlay }, check, keystroke.expectedFingers);
  }
}

function waitForFingerChecks() {
  if (state.pendingFingerChecks === 0) return Promise.resolve();
  return new Promise((resolve) => state.fingerCheckWaiters.push(resolve));
}

function quitExercise() {
  replayer.stop();
  state.exerciseActive = false;
  state.session = null;
  showScreen("choose");
}

async function finishExercise() {
  state.exerciseActive = false;
  const session = state.session;
  await waitForFingerChecks(); // the last keystroke's check arrives a moment later
  if (session.levelId != null) advanceExerciseIndex(session.levelId, session.exerciseIndex);
  state.lastSummary = session.summary();
  showScreen("summary");
}

function initExerciseScreen() {
  ui.exerciseQuit.addEventListener("click", quitExercise);
  ui.typingArea.addEventListener("click", () => ui.typingArea.focus());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.screen === "exercise") quitExercise();
  });
  setInterval(() => state.exerciseActive && updateLiveStats(), LIVE_STATS_INTERVAL_MS);
}

// ---------- Summary screen ----------

function renderSummary() {
  const summary = state.lastSummary;
  if (!summary) return;
  ui.summaryWpm.textContent = `${summary.wpm.toFixed(0)} WPM`;
  ui.summaryCharAccuracy.textContent = formatPercent(summary.charAccuracy);
  ui.summaryFingerAccuracy.textContent =
    summary.fingerAccuracy == null ? "not available" : formatPercent(summary.fingerAccuracy);
}

function renderHistory() {}

function initSummaryScreen() {
  screenEnterHandlers.summary = renderSummary;
  ui.summaryAgain.addEventListener("click", () => {
    const { levelId, exerciseIndex } = state.lastSummary;
    startExercise(levelId, exerciseIndex);
  });
  ui.summaryChoose.addEventListener("click", () => showScreen("choose"));
}

// ---------- Keyboard ----------

function initKeyboard() {
  startKeyboardCapture({
    onKey: (keyEvent) => pipeline.ingestKey(keyEvent, "live"),
    // Calibration also uses Space, so stop it scrolling the page there too.
    isExerciseActive: () => state.exerciseActive || state.screen === "calibrate",
    typingArea: ui.typingArea,
  });
}

pipeline.onKey((keyEvent) => {
  if (state.screen === "exercise" && state.exerciseActive) handleExerciseKey(keyEvent);
  // On the Calibrate screen the thumb on Space starts the capture.
  if (state.screen === "calibrate" && keyEvent.code === "Space" && !calibrationScreen.capturing) calibrationScreen.start();
});

// ---------- Debug panel ----------

const recorder = new Recorder();

// Recordings capture live input only (never a replay of a replay).
pipeline.onFrame((frame, from) => from === "live" && recorder.addFrame(frame));
pipeline.onKey((keyEvent, from) => from === "live" && recorder.addKey(keyEvent));

function recordingMeta() {
  const session = state.session;
  return {
    app: "Typing Form Coach",
    settings: state.settings,
    calibration: state.calibration,
    timestampSource: state.tracker?.stats.timestampSource ?? null,
    delegate: state.tracker?.stats.delegate ?? null,
    exercise: session && state.exerciseActive
      ? { text: session.targetText, levelId: session.levelId, exerciseIndex: session.exerciseIndex, typedBeforeRecording: session.position }
      : null,
  };
}

function startRecording() {
  recorder.start(recordingMeta());
  ui.debugRecord.disabled = true;
  ui.debugStop.disabled = false;
  ui.debugRecordStatus.textContent = "Recording... type normally, then press Stop.";
}

function stopRecording() {
  const recording = recorder.stop({ fpsAtStop: state.tracker?.stats.fps ?? null });
  ui.debugRecord.disabled = false;
  ui.debugStop.disabled = true;
  ui.debugRecordStatus.textContent = `Saved ${recording.frames.length} frames and ${recording.keyEvents.length} key presses.`;
  downloadRecording(recording);
}

/**
 * The text to type during replay. If the recording started at the beginning
 * of an exercise, use that exercise. Otherwise rebuild what was typed from the
 * recorded keys, so every replayed keystroke still gets a finger check.
 */
function replayTargetText(recording) {
  const exercise = recording.meta?.exercise;
  if (exercise?.text && exercise.typedBeforeRecording === 0) return exercise.text;
  const typed = [];
  for (const { key, code } of recording.keyEvents) {
    if (code === "Backspace") typed.pop();
    else if (typeof key === "string" && key.length === 1) typed.push(key);
  }
  return typed.join("");
}

const replayer = createReplayer({
  pipeline,
  onProgress: ({ seconds, totalSeconds }) => {
    ui.debugReplayStatus.textContent = `Replaying: ${seconds.toFixed(1)} s of ${totalSeconds.toFixed(1)} s`;
  },
  onEnd: () => {
    ui.stage.classList.remove("replay");
    overlay.setBlankMode(false);
    ui.replayBadge.hidden = true;
    state.calibration = state.calibrationBeforeReplay ?? state.calibration;
    ui.debugReplayStatus.textContent += " (finished)";
  },
});

async function loadReplay(file) {
  let recording;
  try {
    recording = parseRecording(await file.text());
  } catch (error) {
    ui.debugReplayStatus.textContent = `Could not load ${file.name}: ${error.message}`;
    return;
  }
  // Use the calibration that was active when it was recorded.
  state.calibrationBeforeReplay = state.calibration;
  if (recording.meta?.calibration) state.calibration = recording.meta.calibration;
  ui.stage.classList.add("replay");
  overlay.setBlankMode(true);
  pipeline.setSource("replay");
  const text = replayTargetText(recording);
  if (text.length > 0) startExerciseWithText(text, { levelId: recording.meta?.exercise?.levelId ?? null }, `Replay of ${file.name}`);
  replayer.play(recording);
}

let traceStore = null;
let followLatestTrace = true;

function selectedSnapshot() {
  const id = Number(ui.traceSelect.value);
  return traceStore.snapshots.find((snapshot) => snapshot.id === id) ?? null;
}

function redrawTraces() {
  if (!ui.debugPanel.hidden) drawTraces(ui.traceCanvas, selectedSnapshot(), { relative: ui.traceRelative.checked });
}

function updateTraceOptions(snapshots) {
  const previous = ui.traceSelect.value;
  ui.traceSelect.replaceChildren(
    ...[...snapshots].reverse().map((snapshot) => {
      const option = document.createElement("option");
      option.value = String(snapshot.id);
      option.textContent = describeSnapshot(snapshot);
      return option;
    }),
  );
  // Show the newest keystroke unless the student picked an older one to study.
  const latest = snapshots[snapshots.length - 1];
  ui.traceSelect.value = followLatestTrace || !previous ? String(latest.id) : previous;
  if (!ui.traceSelect.value) ui.traceSelect.value = String(latest.id);
  redrawTraces();
}

function initDebugPanel() {
  ui.debugToggle.addEventListener("click", () => {
    const open = ui.debugPanel.hidden;
    ui.debugPanel.hidden = !open;
    ui.debugToggle.setAttribute("aria-expanded", String(open));
    ui.debugToggle.textContent = open ? "Close debug" : "Debug";
    redrawTraces();
  });
  ui.debugRecord.addEventListener("click", startRecording);
  ui.debugStop.addEventListener("click", stopRecording);
  ui.debugLoad.addEventListener("change", () => {
    const file = ui.debugLoad.files?.[0];
    if (file) loadReplay(file);
    ui.debugLoad.value = ""; // allow loading the same file again
  });
  traceStore = createTraceStore({ pipeline, frameBuffer, onChange: updateTraceOptions });
  ui.traceSelect.addEventListener("change", () => {
    const newestId = traceStore.snapshots[traceStore.snapshots.length - 1]?.id;
    followLatestTrace = Number(ui.traceSelect.value) === newestId;
    redrawTraces();
  });
  ui.traceRelative.addEventListener("change", redrawTraces);
  renderLegend(ui.traceLegend);
  redrawTraces();
}

function updateDebugStats() {
  const stats = state.tracker?.stats;
  ui.debugFps.textContent = stats ? stats.fps.toFixed(1) : "--";
  ui.debugTimestampSource.textContent = stats?.timestampSource ?? "--";
  ui.debugLag.textContent = stats ? `${stats.lagMs.toFixed(0)} ms` : "--";
  ui.debugBufferSize.textContent = `${frameBuffer.size} frames`;
  ui.debugSource.textContent = pipeline.source;
  if (recorder.recording) {
    ui.debugRecordStatus.textContent = `Recording... ${recorder.frames.length} frames, ${recorder.keyEvents.length} keys.`;
  } else if (!ui.debugStop.disabled) {
    // The recorder stopped itself at RECORDING_MAX_FRAMES.
    stopRecording();
  }
}

// ---------- Frame flow ----------

pipeline.onFrame((frame) => {
  overlay.draw(frame);
  if (state.screen === "setup") updateSetupIndicators(frame);
});

// ---------- Start ----------

function start() {
  initSetupScreen();
  initCalibrateScreen();
  initChooseScreen();
  initExerciseScreen();
  initSummaryScreen();
  initKeyboard();
  initDebugPanel();
  setInterval(() => {
    checkFps();
    updateDebugStats();
    if (state.screen === "setup") ui.setupFps.textContent = state.tracker?.running ? state.tracker.stats.fps.toFixed(0) : "--";
  }, 1000);

  if (skipSetup) {
    startExercise(1, 0);
    return;
  }

  showScreen("setup");
  if (!cameraAllowedHere()) {
    showMessage(ui.globalError, CAMERA_ERROR_TEXT.insecure);
    ui.setupStatus.textContent = "Camera is off.";
    fillCameraPicker(ui.cameraPicker, [], null);
    return;
  }
  startCamera(rememberedCamera());
  startTracking();
}

start();
