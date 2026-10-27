// App bootstrap and screen state machine.
// Screens: landing -> setup -> calibrate -> choose -> exercise -> summary (and back).
// main.js wires modules together; the real work lives in the other files.

import {
  ATTRIBUTION_DELAY_MS,
  LIVE_STATS_INTERVAL_MS,
  LOW_FPS_GRACE_MS,
  LOW_FPS_THRESHOLD,
  SETUP_BOTH_HANDS_REQUIRED_MS,
  DATA_COLLECTION_REPEATS,
  DATA_COLLECTION_WRONG_SHARE,
  DATA_COLLECTION_MAX_FRAME_AGE_MS,
  DATA_COLLECTION_TAIL_MS,
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
  watchCameraChanges,
} from "./camera.js";
import { ATTRIBUTION_IMPLEMENTED, attributeKeystroke } from "./core/fingerAttribution.js?v=friend-logic-merge-1";
import { createCalibrationScreen, createKeyboardGridCapture, loadCalibration, pointInVideoFrame, saveCalibration } from "./calibration.js?v=keyboard-discs-1";
import { LEVELS, getExerciseText, getTutorial } from "./exercises.js";
import { beatKind, evaluateAttribution, feedbackMessage, runAttribution, showFingerCheck, showWrongKey } from "./feedback.js?v=friend-logic-merge-1";
import { buildPrompts, createCollectionSession, describePrompt } from "./debug/dataCollection.js";
import { createBeatFlash } from "./beatFlash.js";
import { Recorder, downloadRecording } from "./debug/recorder.js";
import { createReplayer, parseRecording } from "./debug/replay.js";
import { createTraceStore, describeSnapshot, drawTraces, renderLegend } from "./debug/traces.js";
import { describeFingers, expectedFingersForChar, needsShift } from "./fingerMap.js";
import { FrameBuffer } from "./frameBuffer.js";
import { HandTracker } from "./handTracker.js?v=rotation-calibration-1";
import { calibrationMatchesSides, sideSettingsOf } from "./handSides.js?v=rotation-calibration-1";
import { startKeyboardCapture } from "./keyboard.js";
import { Overlay } from "./overlay.js?v=site-fix-1";
import { createPipeline } from "./pipeline.js";
import { createTutorialScreen } from "./tutorial.js?v=site-fix-1";
import { createAboutEssayDemo } from "./aboutEssay.js";
import { renderLessonPaths } from "./lessonPaths.js";
import { LessonVideoRecorder, timeInClip } from "./lessonVideo.js?v=site-fix-1";
import { captureFingerMarks, compactReplayFrame, drawReplayMarks, followingFingerMarks } from "./replayAnnotations.js";
import { renderPracticeRecommendations } from "./practiceRecommendations.js?v=site-fix-1";
import { TypingSession } from "./session.js?v=site-fix-1";
import { formatPercent, historyEntry, renderDashboardFastestFingers, renderDashboardFingerAccuracy, renderDashboardMissedKeys, renderHistory, renderSummary } from "./summaryView.js?v=site-fix-1";
import { KEYS, storage } from "./storage.js?v=site-fix-1";

// ---------- Element lookup ----------

const $ = (id) => document.getElementById(id);
const DEVICE_IS_PHONE = /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(navigator.userAgent);
const DEVICE_IS_MAC = /mac/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);

const ui = {
  globalError: $("global-error"),
  trackingWarning: $("tracking-warning"),
  stage: $("stage"),
  stageEmptyText: $("stage-empty-text"),
  stageCameraOn: $("stage-camera-on"),
  video: $("camera-video"),
  overlayCanvas: $("overlay-canvas"),
  // landing
  landingNavStart: $("landing-nav-start"),
  landingNavTest: $("landing-nav-test"),
  dashboardChecks: [...document.querySelectorAll("[data-dashboard-check]")],
  dashboardLevelList: $("dashboard-level-list"),
  dashboardViewButtons: [...document.querySelectorAll("[data-dashboard-view]")],
  dashboardOverview: $("dashboard-overview"),
  dashboardLessonsView: $("dashboard-lessons-view"),
  dashboardFirstVisit: $("dashboard-first-visit"),
  dashboardStartTitle: $("dashboard-start-title"),
  dashboardStartDescription: $("dashboard-start-description"),
  landingFinalStart: $("landing-final-start"),
  landingSkip: $("landing-skip"),
  dashboardCameraStart: $("dashboard-camera-start"),
  dashboardCameraPreview: $("dashboard-camera-preview"),
  dashboardCameraPreviewDialog: $("dashboard-camera-preview-dialog"),
  dashboardCameraPreviewClose: $("dashboard-camera-preview-close"),
  dashboardPreviewVideo: $("dashboard-preview-video"),
  dashboardPreviewOverlay: $("dashboard-preview-overlay"),
  dashboardPreviewStatus: $("dashboard-preview-status"),
  dashboardFingerAccuracy: $("dashboard-finger-accuracy"),
  dashboardFingerAccuracyNote: $("dashboard-finger-accuracy-note"),
  dashboardFastestList: $("dashboard-fastest-list"),
  dashboardFastestNote: $("dashboard-fastest-note"),
  dashboardMissedList: $("dashboard-missed-list"),
  dashboardMissedNote: $("dashboard-missed-note"),
  dashboardWpmPanel: $("dashboard-wpm-panel"),
  dashboardWpmStart: $("dashboard-wpm-start"),
  dashboardWpmResults: $("dashboard-wpm-results"),
  dashboardWpmLast: $("dashboard-wpm-last"),
  dashboardWpmBest: $("dashboard-wpm-best"),
  typingCopy: $("typing-copy"),
  // standalone baseline typing test
  typingTestInput: $("typing-test-input"),
  typingTestPassage: $("typing-test-passage"),
  typingTestStart: $("typing-test-start"),
  typingTestNext: $("typing-test-next"),
  typingTestWpm: $("typing-test-wpm"),
  typingTestAccuracy: $("typing-test-accuracy"),
  typingTestStatus: $("typing-test-status"),
  // setup
  setupError: $("setup-error"),
  setupNotice: $("setup-notice"),
  cameraPicker: $("camera-picker"),
  cameraRefresh: $("camera-refresh"),
  setupCameraGroup: $("setup-camera-group"),
  mirroredToggle: $("mirrored-toggle"),
  flipToggle: $("flip-toggle"),
  setupRotateVideo: $("setup-rotate-video"),
  facingRadios: document.querySelectorAll('input[name="camera-facing"]'),
  indicatorLeft: $("indicator-left"),
  indicatorRight: $("indicator-right"),
  setupFps: $("setup-fps"),
  positioningTip: $("positioning-tip"),
  setupStatus: $("setup-status"),
  setupBack: $("setup-back"),
  setupContinue: $("setup-continue"),
  setupControlsPanel: $("setup-controls-panel"),
  setupKeyboardConfirmed: $("keyboard-in-frame"),
  setupLabelsConfirmed: $("setup-labels-confirmed"),
  setupStepCount: $("setup-step-count"),
  cameraFlowProgresses: [...document.querySelectorAll("[data-camera-flow-progress]")],
  cameraFlowProgressLabels: [...document.querySelectorAll("[data-camera-flow-label]")],
  setupStepPanels: [...document.querySelectorAll("[data-setup-step]")],
  setupStepDots: [...document.querySelectorAll("[data-step-dot]")],
  setupPlatformCopy: [...document.querySelectorAll("[data-platform-copy]")],
  setupLiveStatus: $("setup-live-status"),
  // calibrate
  calibrateCountdown: $("calibrate-countdown"),
  calibrateStepTag: $("calibrate-step-tag"),
  calibrateTitleText: $("calibrate-title-text"),
  calibrateProgress: $("calibrate-progress"),
  calibrateStatus: $("calibrate-status"),
  calibrateStart: $("calibrate-start"),
  calibrateSkip: $("calibrate-skip"),
  calibrateHomeStep: $("calibrate-home-step"),
  calibrateGridStep: $("calibrate-grid-step"),
  gridTitle: $("grid-title"),
  gridPrompt: $("grid-prompt"),
  gridDiscTray: $("grid-disc-tray"),
  gridDiscLayer: $("grid-disc-layer"),
  gridMapDiscs: [...document.querySelectorAll(".grid-map-disc")],
  gridSteps: [...document.querySelectorAll("#grid-steps li")],
  gridStatus: $("grid-status"),
  gridCaptureButtons: $("grid-capture-buttons"),
  gridReviewButtons: $("grid-review-buttons"),
  gridRestart: $("grid-restart"),
  gridSkip: $("grid-skip"),
  gridContinue: $("grid-continue"),
  gridRedo: $("grid-redo"),
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
  exerciseCameraStatus: $("exercise-camera-status"),
  tutorialCameraStatus: $("tutorial-camera-status"),
  // summary
  summaryHeadline: $("summary-headline"),
  summaryHistogram: $("summary-histogram"),
  histogramNote: $("histogram-note"),
  summarySubstitutions: $("summary-substitutions"),
  historySummary: $("history-summary"),
  summaryWpm: $("summary-wpm"),
  summaryCharAccuracy: $("summary-char-accuracy"),
  summaryFingerAccuracy: $("summary-finger-accuracy"),
  summaryFeedbackCards: $("summary-feedback-cards"),
  summaryNextNote: $("summary-next-note"),
  summaryAgain: $("summary-again"),
  summaryChoose: $("summary-choose"),
  mistakeReplaySection: $("mistake-replay-section"),
  mistakeReplayPassage: $("mistake-replay-passage"),
  mistakeReplayProgress: $("mistake-replay-progress"),
  mistakeReplayMessage: $("mistake-replay-message"),
  mistakeReplayVideoFrame: $("mistake-replay-video-frame"),
  mistakeReplayVideo: $("mistake-replay-video"),
  mistakeReplayOverlay: $("mistake-replay-overlay"),
  mistakeReplayVideoNote: $("mistake-replay-video-note"),
  mistakeReplayPrev: $("mistake-replay-prev"),
  mistakeReplayNext: $("mistake-replay-next"),
  // labeled recording tool
  collectIntro: $("collect-intro"),
  collectRunning: $("collect-running"),
  collectDone: $("collect-done"),
  collectCalibrationNote: $("collect-calibration-note"),
  collectTypist: $("collect-typist"),
  collectStart: $("collect-start"),
  collectBack: $("collect-back"),
  collectPrompt: $("collect-prompt"),
  collectProgressText: $("collect-progress-text"),
  collectProgress: $("collect-progress"),
  collectHands: $("collect-hands"),
  collectStatus: $("collect-status"),
  collectFinish: $("collect-finish"),
  collectCancel: $("collect-cancel"),
  collectResult: $("collect-result"),
  collectAgain: $("collect-again"),
  collectDoneBack: $("collect-done-back"),
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
  debugShowGrid: $("debug-show-grid"),
  debugGridStatus: $("debug-grid-status"),
  debugRecord: $("debug-record"),
  debugStop: $("debug-stop"),
  debugRecordStatus: $("debug-record-status"),
  debugCollect: $("debug-collect"),
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
// The Debug button is for the team: shown with ?debug=1, and under automated
// browser tests (navigator.webdriver), which drive replays through it.
const debugAvailable = params.get("debug") === "1" || navigator.webdriver === true;
// ?reset=1 starts over at Level 1 (for demos): clears lesson progress and
// typing results. The chosen camera and its settings are kept.
if (params.get("reset") === "1") {
  storage.remove(KEYS.exerciseProgress);
  storage.remove(KEYS.history);
  storage.remove(KEYS.typingTestResults);
  params.delete("reset");
  window.history.replaceState(null, "", location.pathname + (params.size ? `?${params}` : "") + location.hash);
}

const state = {
  screen: null,
  settings: storage.loadSettings(),
  stream: null,
  tracker: null,
  trackerReady: false,
  bothHandsSince: null,
  setupStep: 1,
  setupHandsReady: false,
  session: null,
  exerciseActive: false,
  exerciseRunId: 0,
  targetSpans: [],
  lastSummary: null,
  lastExercise: null,
  calibration: loadCalibration(),
  calibrationBeforeReplay: null,
  pendingFingerChecks: 0,
  fingerCheckWaiters: [],
  setupStarted: false,
  cameraLost: false, // the camera stopped by itself; reconnect when it comes back
  dashboardSetupComplete: false,
  hasCompletedCameraSetup: storage.getJSON(KEYS.cameraSetupCompleted, false) === true,
  dashboardPreviewStream: null,
  dashboardPreviewRequestId: 0,
  typingTestNextScreen: "setup",
  typingTestStartedAt: null,
  typingTestFinishedAt: null,
  typingTestActive: false,
  typingTestFinished: false,
};

function clearSavedCalibration() {
  state.calibration = null;
  storage.remove(KEYS.calibration);
}

const frameBuffer = new FrameBuffer();
const pipeline = createPipeline({ frameBuffer });
const overlay = new Overlay(ui.overlayCanvas, ui.video);
const lessonVideo = new LessonVideoRecorder();
let lessonRecordingSession = null;
let lessonTrackingFrames = [];
const beatFlash = createBeatFlash($("beat-flash"));
const dashboardPreviewOverlay = new Overlay(ui.dashboardPreviewOverlay, ui.dashboardPreviewVideo);
dashboardPreviewOverlay.setHandsVisible(false);

// ---------- Screens ----------

const STAGE_SLOTS = {
  setup: "setup-stage-slot",
  calibrate: "calibrate-stage-slot",
  exercise: "exercise-stage-slot",
  collect: "collect-stage-slot",
};

const TYPING_TEST_PASSAGE = "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, \"and what is the use of a book,\" thought Alice \"without pictures or conversations?\"";
const aboutEssayDemo = createAboutEssayDemo({ section: $("about-who"), replayButton: $("about-essay-replay") });
let typingTestWpmIntervalId = null;
let mistakeReplayIndex = 0;
let mistakeReplaySpans = [];
let activePageTurn = null;
let resetLandingAnimations = () => {};
let startLandingAnimations = () => {};

function renderScreen(name) {
  if (state.screen === "typing-test" && name !== "typing-test") stopTypingTest();
  if (state.screen === "summary" && name !== "summary") {
    stopMistakeReplay();
    clearLessonRecording();
  }
  if (state.screen === "about" && name !== "about") aboutEssayDemo.leave();
  state.screen = name;
  const navItems = [
    [$("landing-nav-how"), null],
    [ui.landingNavTest, name === "typing-test" ? "page" : null],
    [$("landing-nav-about"), name === "about" ? "page" : null],
    [ui.landingNavStart, ["dashboard", "setup", "calibrate", "choose", "tutorial", "exercise", "summary", "collect"].includes(name) ? "page" : null],
  ];
  for (const [item, current] of navItems) {
    if (current) item.setAttribute("aria-current", current);
    else item.removeAttribute("aria-current");
  }
  if (name !== "calibrate") {
    ui.stage.classList.remove("is-mapping");
    overlay.setKeyboardTouches(null);
  }
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
  updateOverlayGrid();
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  // Move keyboard and screen reader focus to the new screen's heading.
  // (The exercise screen focuses its typing area instead.)
  if (name === "typing-test") ui.typingTestInput.focus({ preventScroll: true });
  else if (name !== "exercise") document.querySelector(`#screen-${name} :is(h1, h2)`)?.focus({ preventScroll: true });
}

function showScreen(name) {
  if (state.screen === name) return Promise.resolve();
  const animate = state.screen !== null && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!animate) {
    renderScreen(name);
    return Promise.resolve();
  }

  activePageTurn?.finish();
  const cover = document.createElement("div");
  cover.className = "page-turn-cover";
  cover.setAttribute("aria-hidden", "true");
  if (name === "landing") cover.classList.add("page-turn-cover--landing");
  const appHeader = document.querySelector(".app-header");
  appHeader.classList.add("is-page-turning");
  cover.innerHTML = `
    <svg class="page-turn-art" aria-hidden="true" preserveAspectRatio="none">
      <defs>
        <pattern id="page-turn-rules" patternUnits="userSpaceOnUse" width="4000" height="64">
          <rect width="4000" height="64" fill="var(--turn-paper)" />
          <path d="M0 63.5H4000" stroke="rgba(255, 107, 107, 0.16)" stroke-width="1" />
        </pattern>
        <linearGradient id="page-turn-fold-shade" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#fff" stop-opacity="0" />
          <stop offset="0.58" stop-color="#fff" stop-opacity="0.14" />
          <stop offset="0.82" stop-color="#000" stop-opacity="0.22" />
          <stop offset="1" stop-color="#fff" stop-opacity="0.12" />
        </linearGradient>
        <clipPath id="page-turn-clip"><path class="page-turn-clip-shape" /></clipPath>
      </defs>
      <path class="page-turn-sheet" fill="url(#page-turn-rules)" />
      <path class="page-turn-margin" clip-path="url(#page-turn-clip)" />
      <path class="page-turn-fold" clip-path="url(#page-turn-clip)" stroke="url(#page-turn-fold-shade)" />
    </svg>
    <div class="page-turn-logo" aria-hidden="true">high<span class="logo-circled logo-serif">type</span></div>`;
  document.body.append(cover);

  const svg = cover.querySelector("svg");
  const sheet = cover.querySelector(".page-turn-sheet");
  const clip = cover.querySelector(".page-turn-clip-shape");
  const margin = cover.querySelector(".page-turn-margin");
  const fold = cover.querySelector(".page-turn-fold");
  const shade = cover.querySelector("#page-turn-fold-shade");
  const duration = 850;
  return new Promise((resolve) => {
    let finished = false;
    let rendered = false;
    let frameId;
    let revealTimer;
    let safetyTimer;
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(frameId);
      clearTimeout(revealTimer);
      clearTimeout(safetyTimer);
      if (!rendered) renderScreen(name);
      cover.remove();
      appHeader.classList.remove("is-page-turning");
      if (activePageTurn?.cover === cover) activePageTurn = null;
      resolve();
    };
    const reveal = () => {
      if (rendered || finished) return;
      rendered = true;
      renderScreen(name);
      cover.classList.add("is-revealing");
      revealTimer = setTimeout(finish, 180);
    };
    const startTime = performance.now();
    const draw = (now) => {
      if (finished) return;
      const width = window.innerWidth;
      // Leave the coral divider on the sticky header above the animated sheet.
      const topOffset = appHeader.getBoundingClientRect().bottom + 2;
      const height = Math.max(1, window.innerHeight - topOffset);
      cover.style.setProperty("--page-turn-top", `${topOffset}px`);
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      const time = Math.min(1, (now - startTime) / duration);
      const progress = time < 0.5 ? 4 * time ** 3 : 1 - (-2 * time + 2) ** 3 / 2;
      const edge = -50 + (width + 110) * progress;
      const bend = Math.sin(Math.PI * time) * Math.min(70, width * 0.05);
      const top = edge - bend * 0.4;
      const middle = edge + bend;
      const bottom = edge - bend * 0.7;
      const curve = `M ${top} 0 C ${top + bend * 0.65} ${height * 0.2}, ${middle + bend * 0.12} ${height * 0.34}, ${middle} ${height * 0.5} C ${middle - bend * 0.3} ${height * 0.7}, ${bottom + bend * 0.55} ${height * 0.84}, ${bottom} ${height}`;
      const page = `M -50 0 L ${top} 0 C ${top + bend * 0.65} ${height * 0.2}, ${middle + bend * 0.12} ${height * 0.34}, ${middle} ${height * 0.5} C ${middle - bend * 0.3} ${height * 0.7}, ${bottom + bend * 0.55} ${height * 0.84}, ${bottom} ${height} L -50 ${height} Z`;
      sheet.setAttribute("d", page);
      clip.setAttribute("d", page);
      fold.setAttribute("d", curve);
      margin.setAttribute("d", `M ${Math.min(160, width * 0.11)} 0 V ${height}`);
      shade.setAttribute("x1", String(edge - 60));
      shade.setAttribute("x2", String(edge + 20));
      if (time < 1) frameId = requestAnimationFrame(draw);
      else reveal();
    };
    activePageTurn = { cover, finish };
    safetyTimer = setTimeout(reveal, duration + 200);
    frameId = requestAnimationFrame(draw);
  });
}

const screenEnterHandlers = {};

function stopTypingTest() {
  if (typingTestWpmIntervalId !== null) {
    clearInterval(typingTestWpmIntervalId);
    typingTestWpmIntervalId = null;
  }
  state.typingTestActive = false;
}

function typingTestMetrics(now = performance.now()) {
  const typed = [...ui.typingTestInput.value];
  const target = [...TYPING_TEST_PASSAGE];
  let correct = 0;
  typed.forEach((character, index) => {
    if (character === target[index]) correct += 1;
  });
  const elapsedMs = state.typingTestStartedAt == null
    ? 0
    : Math.max(0, (state.typingTestFinishedAt ?? now) - state.typingTestStartedAt);
  const elapsedMinutes = elapsedMs / 60_000;
  return {
    correct,
    typed: typed.length,
    wpm: elapsedMinutes > 0 ? Math.round((correct / 5) / elapsedMinutes) : 0,
    accuracy: typed.length ? correct / typed.length : 1,
  };
}

function renderTypingTestTarget() {
  const typed = [...ui.typingTestInput.value];
  const target = [...TYPING_TEST_PASSAGE];
  const fragment = document.createDocumentFragment();
  target.forEach((character, index) => {
    const letter = document.createElement("span");
    letter.textContent = character;
    if (index < typed.length) {
      if (typed[index] === character) {
        letter.className = "typing-test-letter typing-test-letter--typed";
      } else {
        letter.className = "typing-test-letter typing-test-letter--wrong";
        letter.dataset.entered = typed[index];
      }
    } else {
      letter.className = "typing-test-letter typing-test-letter--ghost";
    }
    if (!state.typingTestFinished && index === typed.length) {
      letter.classList.add("typing-test-letter--current");
    }
    fragment.append(letter);
  });
  ui.typingTestPassage.replaceChildren(fragment);
}

function alignTypingTestPassageToNotebook() {
  const editor = ui.typingTestPassage.parentElement;
  const firstLetter = ui.typingTestPassage.querySelector(".typing-test-letter");
  if (!editor || !firstLetter || $("screen-typing-test").hidden) return;

  editor.style.setProperty("--typing-test-line-shift", "0px");
  const range = document.createRange();
  range.selectNodeContents(firstLetter);
  const glyphRect = range.getBoundingClientRect();
  if (!glyphRect.height) return;

  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const bodyStyle = getComputedStyle(document.body);
  const cssLengthToPixels = (value) => {
    const amount = Number.parseFloat(value);
    return value.trim().endsWith("rem") ? amount * rootFontSize : amount;
  };
  const ruleGap = cssLengthToPixels(bodyStyle.getPropertyValue("--notebook-rule-gap"));
  const firstRule = cssLengthToPixels(bodyStyle.getPropertyValue("--notebook-first-rule"));
  if (!ruleGap || !firstRule) return;
  const glyphBottom = glyphRect.bottom + window.scrollY + editor.scrollTop;
  const ruleIndex = Math.max(0, Math.ceil((glyphBottom + 2 - firstRule) / ruleGap));
  const ruleBelowGlyph = firstRule + ruleIndex * ruleGap;
  const shift = ruleBelowGlyph - glyphBottom - 2;
  editor.style.setProperty("--typing-test-line-shift", `${shift}px`);
}

function updateTypingTestDisplay(now = performance.now()) {
  const metrics = typingTestMetrics(now);
  ui.typingTestWpm.textContent = String(metrics.wpm);
  ui.typingTestAccuracy.textContent = `${Math.round(metrics.accuracy * 100)}%`;
  return metrics;
}

function finishTypingTest(now = performance.now()) {
  if (!state.typingTestActive) return;
  state.typingTestFinished = true;
  state.typingTestFinishedAt = now;
  stopTypingTest();
  ui.typingTestInput.disabled = true;
  ui.typingTestStart.disabled = false;
  ui.typingTestStart.textContent = "Try again";
  ui.typingTestNext.textContent = state.typingTestNextScreen === "dashboard"
    ? "Back to dashboard"
    : state.typingTestNextScreen === "choose" ? "Continue to lesson choice" : "Continue to camera setup";
  ui.typingTestNext.hidden = false;
  const metrics = updateTypingTestDisplay(now);
  const priorResults = storage.getJSON(KEYS.typingTestResults, []);
  const results = Array.isArray(priorResults) ? priorResults : [];
  storage.setJSON(KEYS.typingTestResults, [
    { wpm: metrics.wpm, accuracy: metrics.accuracy, finishedAt: new Date().toISOString() },
    ...results,
  ].slice(0, 20));
  renderTypingTestTarget();
  ui.typingTestStatus.textContent = `Passage complete! ${ui.typingTestWpm.textContent} WPM at ${ui.typingTestAccuracy.textContent} accuracy.`;
}

function startTypingTest(preserveInput = false) {
  stopTypingTest();
  state.typingTestFinished = false;
  state.typingTestFinishedAt = null;
  state.typingTestStartedAt = performance.now();
  state.typingTestActive = true;
  if (!preserveInput) ui.typingTestInput.value = "";
  ui.typingTestInput.disabled = false;
  ui.typingTestStart.disabled = true;
  ui.typingTestStart.textContent = "Test in progress";
  ui.typingTestNext.hidden = true;
  ui.typingTestStatus.textContent = "Go! Keep a steady pace.";
  updateTypingTestDisplay(state.typingTestStartedAt);
  renderTypingTestTarget();
  if (!preserveInput) ui.typingTestInput.focus({ preventScroll: true });
  typingTestWpmIntervalId = setInterval(updateTypingTestDisplay, 1000);
}

function resetTypingTest() {
  stopTypingTest();
  state.typingTestStartedAt = null;
  state.typingTestFinishedAt = null;
  state.typingTestFinished = false;
  ui.typingTestInput.value = "";
  ui.typingTestInput.disabled = false;
  ui.typingTestStart.disabled = false;
  ui.typingTestStart.textContent = "Start test";
  ui.typingTestNext.hidden = true;
  ui.typingTestStatus.textContent = "Click Start test, or just start typing.";
  updateTypingTestDisplay();
  renderTypingTestTarget();
  requestAnimationFrame(alignTypingTestPassageToNotebook);
}

function openTypingTest(nextScreen) {
  state.typingTestNextScreen = nextScreen;
  showScreen("typing-test");
}

function initTypingTestScreen() {
  window.addEventListener("resize", () => requestAnimationFrame(alignTypingTestPassageToNotebook));
  ui.typingTestStart.addEventListener("click", () => startTypingTest());
  ui.typingTestInput.addEventListener("input", () => {
    const typed = [...ui.typingTestInput.value];
    if (typed.length > TYPING_TEST_PASSAGE.length) {
      ui.typingTestInput.value = typed.slice(0, TYPING_TEST_PASSAGE.length).join("");
    }
    if (!state.typingTestActive && !state.typingTestFinished && ui.typingTestInput.value.length) {
      startTypingTest(true);
    }
    if (state.typingTestActive) updateTypingTestDisplay();
    if (state.typingTestActive && [...ui.typingTestInput.value].length >= TYPING_TEST_PASSAGE.length) {
      finishTypingTest();
      return;
    }
    renderTypingTestTarget();
  });
  ui.typingTestInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.preventDefault();
  });
  ui.typingTestNext.addEventListener("click", () => {
    if (state.typingTestNextScreen === "choose") showScreen("choose");
    else if (state.typingTestNextScreen === "dashboard") openDashboard();
    else openCameraSetup();
  });
  screenEnterHandlers["typing-test"] = resetTypingTest;
}

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

let cameraRequestId = 0;

async function startCamera(deviceId) {
  const requestId = ++cameraRequestId;
  closeCamera(state.stream);
  state.stream = null;
  showMessage(ui.setupError, "");
  ui.setupStatus.textContent = "Starting camera...";
  let stream;
  try {
    stream = await openCamera(deviceId);
  } catch (error) {
    if (requestId !== cameraRequestId) return;
    const kind = error instanceof CameraError ? error.kind : "unknown";
    const extra = kind === "unknown" ? ` (${error.message})` : "";
    showMessage(ui.setupError, CAMERA_ERROR_TEXT[kind] + extra);
    ui.setupStatus.textContent = "Camera is off.";
    setStagePlaceholder(CAMERA_ERROR_TEXT[kind], "Try again");
    fillCameraPicker(ui.cameraPicker, await listCameras().catch(() => []), null);
    updateSetupWizardControls();
    return;
  }
  if (requestId !== cameraRequestId) {
    closeCamera(stream);
    return;
  }
  state.stream = stream;
  state.cameraLost = false;
  watchForCameraEnding(stream);
  ui.video.srcObject = state.stream;
  ui.stage.classList.add("has-video");
  setStagePlaceholder("Camera is off.", "Turn on camera");
  await ui.video.play().catch(() => {});
  const activeId = deviceIdOf(state.stream);
  rememberCamera(activeId);
  const cameras = await listCameras();
  if (requestId !== cameraRequestId) return;
  fillCameraPicker(ui.cameraPicker, cameras, activeId);
  updateSetupWizardControls();
  ui.setupStatus.textContent = state.trackerReady ? "Tracking hands." : "Camera on. Loading hand tracking...";
}

/** Re-read the camera list, keeping the camera that is running selected. */
async function refreshCameraPicker() {
  const cameras = await listCameras().catch(() => []);
  fillCameraPicker(ui.cameraPicker, cameras, deviceIdOf(state.stream));
  updateSetupWizardControls();
  // A camera that disconnected (Continuity Camera often does) comes back as a
  // device change: reconnect on our own if a camera screen is showing.
  if (state.cameraLost && !state.stream && STAGE_SLOTS[state.screen]) turnCameraOn();
}

/** The message and button shown in the camera area when there is no video. */
function setStagePlaceholder(text, buttonText) {
  ui.stageEmptyText.textContent = text;
  ui.stageCameraOn.textContent = buttonText;
}

/**
 * If the camera stops by itself (an iPhone locks, moves away or drops Wi-Fi),
 * say so in the camera area and offer to reconnect, instead of a frozen picture.
 */
function watchForCameraEnding(stream) {
  const [track] = stream.getVideoTracks();
  track?.addEventListener("ended", () => {
    if (state.stream !== stream) return; // replaced or closed on purpose
    state.stream = null;
    state.cameraLost = true;
    ui.video.srcObject = null;
    ui.stage.classList.remove("has-video");
    ui.setupStatus.textContent = "Camera disconnected.";
    setStagePlaceholder(
      "The camera disconnected. If you're using an iPhone, wake it up and keep it near your Mac, then reconnect.",
      "Reconnect camera",
    );
  });
}

/** Start (or restart) the camera and hand tracking from the camera area's button. */
async function turnCameraOn() {
  if (!cameraAllowedHere()) {
    setStagePlaceholder(CAMERA_ERROR_TEXT.insecure, "Try again");
    return;
  }
  state.setupStarted = true;
  setStagePlaceholder("Starting camera…", "Turn on camera");
  await startCamera(rememberedCamera());
  if (state.stream && !state.tracker?.running) await startTracking();
}

// ---------- Hand tracking ----------

async function startTracking() {
  if (state.tracker) {
    state.tracker.start();
    return;
  }
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
  if (!state.setupStarted) return;
  state.tracker.start();
  if (state.stream) ui.setupStatus.textContent = "Tracking hands.";
}

function openCameraSetup() {
  clearSavedCalibration();
  state.dashboardSetupComplete = false;
  const pageTurned = showScreen("setup");
  if (state.setupStarted) return;
  state.setupStarted = true;
  if (!cameraAllowedHere()) {
    showMessage(ui.globalError, CAMERA_ERROR_TEXT.insecure);
    ui.setupStatus.textContent = "Camera is off.";
    fillCameraPicker(ui.cameraPicker, [], null);
    return;
  }
  // Start the camera and load hand tracking once the page turn has finished:
  // loading the tracker keeps the browser busy, and doing it during the
  // animation stretched an 0.85 s page turn to about 5 s.
  pageTurned.then(() => {
    if (state.screen !== "setup" || !state.setupStarted) return; // left setup already
    startCamera(rememberedCamera());
    startTracking();
  });
}

function closeDashboardCameraPreview() {
  state.dashboardPreviewRequestId += 1;
  closeCamera(state.dashboardPreviewStream);
  state.dashboardPreviewStream = null;
  ui.dashboardPreviewVideo.srcObject = null;
  dashboardPreviewOverlay.setKeyboardGrid(null);
  ui.dashboardCameraPreview.disabled = false;
}

async function openDashboardCameraPreview() {
  if (ui.dashboardCameraPreviewDialog.open || ui.dashboardCameraPreview.disabled) return;
  ui.dashboardCameraPreviewDialog.showModal();
  ui.dashboardCameraPreview.disabled = true;
  ui.dashboardPreviewStatus.textContent = "Starting camera…";
  dashboardPreviewOverlay.setHandsVisible(false);
  dashboardPreviewOverlay.setRotated(state.settings.rotated);
  dashboardPreviewOverlay.setFlipped(state.settings.flipView);
  dashboardPreviewOverlay.setKeyboardGrid(state.calibration?.keyboardGrid ?? null);
  const requestId = ++state.dashboardPreviewRequestId;
  try {
    const stream = await openCamera(rememberedCamera());
    if (requestId !== state.dashboardPreviewRequestId || !ui.dashboardCameraPreviewDialog.open) {
      closeCamera(stream);
      return;
    }
    state.dashboardPreviewStream = stream;
    ui.dashboardPreviewVideo.classList.toggle("is-rotated", state.settings.rotated);
    ui.dashboardPreviewVideo.classList.toggle("is-flipped", state.settings.flipView);
    ui.dashboardPreviewVideo.srcObject = stream;
    await ui.dashboardPreviewVideo.play().catch(() => {});
    // Re-draw after metadata is available so the mapping matches the camera's
    // actual aspect ratio and stays aligned with a rotated preview.
    dashboardPreviewOverlay.setKeyboardGrid(state.calibration?.keyboardGrid ?? null);
    if (requestId === state.dashboardPreviewRequestId && ui.dashboardCameraPreviewDialog.open) {
      ui.dashboardPreviewStatus.textContent = "Live camera preview.";
    }
  } catch (error) {
    if (requestId === state.dashboardPreviewRequestId) {
      ui.dashboardPreviewStatus.textContent = `Camera preview unavailable. ${error.message}`;
    }
  } finally {
    if (requestId === state.dashboardPreviewRequestId) ui.dashboardCameraPreview.disabled = false;
  }
}

function leaveCurrentCameraFlow() {
  state.exerciseRunId += 1;
  clearLessonRecording();
  if (collection) cancelCollection();
  if (ui.dashboardCameraPreviewDialog.open) ui.dashboardCameraPreviewDialog.close();
  closeDashboardCameraPreview();
  ++cameraRequestId;
  closeCamera(state.stream);
  state.stream = null;
  ui.video.srcObject = null;
  ui.stage.classList.remove("has-video");
  state.tracker?.stop();
  state.setupStarted = false;
  state.exerciseActive = false;
  replayer.stop();
}

function openDashboard() {
  if (state.screen !== "landing") leaveCurrentCameraFlow();
  return showScreen("dashboard");
}

function openDashboardLessons() {
  return openDashboard().then(() => setDashboardView("lessons", true));
}

function updateDashboardChecklist() {
  const complete = {
    hands: Boolean(state.calibration?.baselines),
    labels: ui.setupLabelsConfirmed.checked,
    keyboard: ui.setupKeyboardConfirmed.checked,
    keys: Boolean(state.calibration?.keyboardGrid),
  };
  for (const item of ui.dashboardChecks) {
    const done = complete[item.dataset.dashboardCheck];
    item.classList.toggle("is-complete", done);
    item.querySelector(".dashboard-check-state").textContent = done ? "Ready" : "To do";
    item.setAttribute("aria-label", `${item.querySelector(".dashboard-check-copy strong").textContent}: ${done ? "ready" : "to do"}`);
  }
  const allComplete = Object.values(complete).every(Boolean);
  const panel = ui.dashboardStartTitle.closest(".dashboard-start-panel");
  panel.classList.toggle("is-camera-ready", allComplete);
  panel.classList.toggle("has-camera-history", state.hasCompletedCameraSetup);
  ui.dashboardStartTitle.textContent = allComplete
    ? "Camera is all set up!"
    : state.hasCompletedCameraSetup ? "Welcome back." : "Let's get you set up.";
  ui.dashboardStartDescription.textContent = allComplete
    ? "Your camera and keyboard are ready for personalized practice."
    : state.hasCompletedCameraSetup
      ? "Explore lessons now, or set up your camera again for personalized coaching."
      : "Once HighType can see your keyboard, you'll be all set for personalized practice.";
  ui.dashboardCameraStart.textContent = allComplete ? "Recalibrate camera" : "Set up camera";
  ui.dashboardCameraStart.classList.toggle("primary", !allComplete);
  ui.dashboardCameraStart.classList.toggle("secondary", allComplete);
  ui.dashboardCameraPreview.hidden = !allComplete;
}

function updateDashboardFirstVisit() {
  const needsSetup = !state.hasCompletedCameraSetup;
  $("screen-dashboard").classList.toggle("is-first-setup", needsSetup);
  ui.dashboardFirstVisit.hidden = !needsSetup;
}

function updateDashboardWpm() {
  ui.dashboardWpmPanel.hidden = !state.hasCompletedCameraSetup && !state.dashboardSetupComplete;
  const stored = storage.getJSON(KEYS.typingTestResults, []);
  const results = Array.isArray(stored) ? stored.filter((result) => Number.isFinite(result?.wpm)) : [];
  ui.dashboardWpmResults.hidden = results.length === 0;
  if (!results.length) return;
  ui.dashboardWpmLast.textContent = String(results[0].wpm);
  ui.dashboardWpmBest.textContent = String(Math.max(...results.map((result) => result.wpm)));
}

function setDashboardView(view, focusHeading = false) {
  const lessonsVisible = view === "lessons";
  ui.dashboardOverview.hidden = lessonsVisible;
  ui.dashboardLessonsView.hidden = !lessonsVisible;
  for (const button of ui.dashboardViewButtons) {
    if (button.dataset.dashboardView === view) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  if (focusHeading) {
    const heading = lessonsVisible ? $("dashboard-lessons-title") : $("dashboard-title");
    heading.focus({ preventScroll: true });
  }
}

function returnToLanding(event, anchorId = null) {
  event.preventDefault();
  if (state.screen === "landing") {
    if (anchorId) {
      document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
      resetLandingAnimations();
      requestAnimationFrame(startLandingAnimations);
    }
    return;
  }
  leaveCurrentCameraFlow();
  resetLandingAnimations();
  showScreen("landing").then(() => {
    startLandingAnimations();
    if (anchorId) requestAnimationFrame(() => document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  });
}

function initLandingScreen() {
  screenEnterHandlers.about = aboutEssayDemo.enter;
  screenEnterHandlers.dashboard = () => {
    updateDashboardChecklist();
    const history = storage.loadHistory();
    renderDashboardFingerAccuracy(ui.dashboardFingerAccuracy, ui.dashboardFingerAccuracyNote, history);
    renderDashboardFastestFingers(ui.dashboardFastestList, ui.dashboardFastestNote, history);
    renderDashboardMissedKeys(ui.dashboardMissedList, ui.dashboardMissedNote, history);
    updateDashboardWpm();
    renderLevelList(ui.dashboardLevelList);
    setDashboardView("overview");
    updateDashboardFirstVisit();
  };
  for (const button of ui.dashboardViewButtons) {
    button.addEventListener("click", () => setDashboardView(button.dataset.dashboardView, true));
  }
  document.querySelector(".app-header .logo").addEventListener("click", returnToLanding);
  document.querySelector("#landing-nav-how").addEventListener("click", (event) => returnToLanding(event, "how-it-works"));
  ui.landingNavTest.addEventListener("click", (event) => {
    event.preventDefault();
    if (state.screen !== "landing") leaveCurrentCameraFlow();
    openTypingTest("setup");
  });
  document.querySelector("#landing-nav-about").addEventListener("click", (event) => {
    event.preventDefault();
    if (state.screen !== "landing") leaveCurrentCameraFlow();
    showScreen("about");
  });
  ui.dashboardCameraStart.addEventListener("click", openCameraSetup);
  ui.dashboardWpmStart.addEventListener("click", () => {
    leaveCurrentCameraFlow();
    openTypingTest("dashboard");
  });
  ui.dashboardCameraPreview.addEventListener("click", openDashboardCameraPreview);
  ui.dashboardCameraPreviewClose.addEventListener("click", () => ui.dashboardCameraPreviewDialog.close());
  ui.dashboardCameraPreviewDialog.addEventListener("close", closeDashboardCameraPreview);
  ui.dashboardCameraPreviewDialog.addEventListener("click", (event) => {
    if (event.target === ui.dashboardCameraPreviewDialog) ui.dashboardCameraPreviewDialog.close();
  });
  const landingStage = document.querySelector(".landing-stage");
  for (const button of [ui.landingNavStart, ui.landingFinalStart, $("about-start")]) {
    button.addEventListener("click", openDashboard);
  }
  for (const button of [ui.landingSkip, ...document.querySelectorAll(".hero-narrative-try")]) {
    button.addEventListener("click", openDashboard);
  }

  const appHeader = document.querySelector(".app-header");
  const storySections = [...document.querySelectorAll(".landing-story-section")];
  const speedStorySentence = "... but our fingers don't all keep up at the same pace. Hightype is here to fix that.";
  const storyCopy = [
    speedStorySentence,
    speedStorySentence,
    speedStorySentence,
    "Most typing trainers measure keystrokes and speed, but they can’t see which fingers you use or how your hands move.",
  ];
  let nextStoryCopy = 0;
  const storyGroups = storySections.map((section) => {
    const targets = [...section.querySelectorAll(".hero-info-typed")];
    const copy = storyCopy.slice(nextStoryCopy, nextStoryCopy + targets.length);
    nextStoryCopy += targets.length;
    return { section, targets, copy };
  });
  const activeStorySections = new Set();
  let storyGeneration = 0;
  const storyObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      if (activeStorySections.has(entry.target)) continue;
      storyObserver.unobserve(entry.target);
      const group = storyGroups.find((item) => item.section === entry.target);
      if (group) {
        activeStorySections.add(entry.target);
        typeStorySection(group);
      }
    }
  }, { threshold: 0.35 });
  const typeStorySection = async ({ section, targets, copy }) => {
    const generation = storyGeneration;
    const isCurrent = () => generation === storyGeneration;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const typingDelay = (character, target) => {
      const wordsPerMinute = Number(target.dataset.speedWpm);
      const lettersPerSecond = Number(target.dataset.speedLps);
      if (wordsPerMinute || lettersPerSecond) {
        const baseDelay = wordsPerMinute ? 60000 / (wordsPerMinute * 5) : 1000 / lettersPerSecond;
        if (character === " ") return baseDelay * (1.2 + Math.random() * 0.2);
        if (/[.!?]/.test(character)) return baseDelay * (2 + Math.random() * 0.5);
        if (/[,;:—]/.test(character)) return baseDelay * (1.6 + Math.random() * 0.3);
        return baseDelay * (0.9 + Math.random() * 0.2);
      }
      const variation = 28 + Math.random() * 48;
      if (character === " ") return 95 + Math.random() * 110;
      if (/[.!?]/.test(character)) return 430 + Math.random() * 240;
      if (/[,;:—]/.test(character)) return 260 + Math.random() * 180;
      if (character === "\n") return 180 + Math.random() * 120;
      return variation;
    };
    const typeTarget = async (target, index) => {
      const caret = target.nextElementSibling;
      const wpmReadout = caret.nextElementSibling;
      target.closest(".hero-story-copy").dataset.ghost = copy[index];
      caret.classList.add("is-active");
      if (reducedMotion) {
        target.textContent = copy[index];
      } else {
        const typeInto = async (element, text) => {
          for (const character of text) {
            if (!isCurrent()) return false;
            element.textContent += character;
            await new Promise((resolve) => setTimeout(resolve, typingDelay(character, target)));
          }
          return isCurrent();
        };
        const typoPlan = index === 0
          ? { word: "fingers", mistake: "fingres" }
          : index === 2
            ? { word: "same", mistake: "smae" }
            : null;
        const typoStart = typoPlan ? copy[index].indexOf(typoPlan.word) : -1;
        if (typoPlan && typoStart >= 0) {
          if (!await typeInto(target, copy[index].slice(0, typoStart)) || !isCurrent()) return;
          const mistake = document.createElement("span");
          mistake.className = "speed-story-mistake";
          target.append(mistake);
          if (!await typeInto(mistake, typoPlan.mistake) || !isCurrent()) return;
          await new Promise((resolve) => setTimeout(resolve, 180));
          if (!isCurrent()) return;
          while (mistake.textContent.length) {
            mistake.textContent = mistake.textContent.slice(0, -1);
            await new Promise((resolve) => setTimeout(resolve, 36));
            if (!isCurrent()) return;
          }
          mistake.remove();
          if (!await typeInto(target, typoPlan.word + copy[index].slice(typoStart + typoPlan.word.length))) return;
        } else {
          if (!await typeInto(target, copy[index])) return;
        }
      }
      if (!isCurrent()) return;
      caret.classList.remove("is-active");
      if (wpmReadout && (target.dataset.speedWpm || target.dataset.speedLps)) {
        const wordsPerMinute = Number(target.dataset.speedWpm)
          || Math.round(Number(target.dataset.speedLps) * 60 / 5);
        wpmReadout.textContent = `${wordsPerMinute} WPM`;
        wpmReadout.classList.add("is-visible");
      }
    };
    if (section.id === "how-it-works") {
      await Promise.all(targets.map((target, index) => typeTarget(target, index)));
    } else {
      for (let index = 0; index < targets.length; index += 1) {
        if (!isCurrent()) return;
        await typeTarget(targets[index], index);
        if (!isCurrent()) return;
        if (!reducedMotion && index < targets.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, index === 0 ? 220 : 140));
        }
      }
    }
  };
  for (const section of storySections) storyObserver.observe(section);
  const leftHeroCardCarousel = document.querySelector(".hero-card-carousel");
  const heroRecordDurations = ["15 seconds", "30 seconds", "60 seconds", "2 minutes"];
  const randomizeHeroRecord = (recordCard) => {
    if (!recordCard) return;
    const recordNumber = recordCard.querySelector(".hero-record-number");
    const durationLabel = recordCard.querySelector(".hero-record-duration");
    if (!recordNumber || !durationLabel) return;
    const previousWpm = Number(recordNumber.textContent);
    let wpm;
    do {
      wpm = Math.floor(Math.random() * 81) + 90;
    } while (wpm === previousWpm);
    const previousDuration = durationLabel.textContent;
    const availableDurations = heroRecordDurations.filter((duration) => duration !== previousDuration);
    const duration = availableDurations[Math.floor(Math.random() * availableDurations.length)];
    recordNumber.textContent = String(wpm);
    durationLabel.textContent = duration;
    recordCard.setAttribute("aria-label", `New record, ${wpm} words per minute in ${duration}`);
    const graphLine = recordCard.querySelector(".hero-record-graph-line");
    const graphDot = recordCard.querySelector(".hero-record-graph-dot");
    if (graphLine && graphDot) {
      const graphX = [6, 23, 39, 57, 73, 96];
      const startY = 26 + Math.random() * 15;
      const endY = startY + (Math.random() - 0.5) * 6;
      const graphPoints = graphX.map((x, index) => {
        if (index === 0) return { x, y: Number(startY.toFixed(1)) };
        if (index === graphX.length - 1) return { x, y: Number(endY.toFixed(1)) };
        const progress = index / (graphX.length - 1);
        const baseline = startY + (endY - startY) * progress;
        const y = Math.max(8, Math.min(52, baseline + (Math.random() - 0.5) * 24));
        return { x, y: Number(y.toFixed(1)) };
      });
      graphLine.setAttribute("d", graphPoints.map(({ x, y }, index) => `${index ? "L" : "M"}${x} ${y}`).join(" "));
      const lastGraphPoint = graphPoints[graphPoints.length - 1];
      graphDot.setAttribute("cx", String(lastGraphPoint.x));
      graphDot.setAttribute("cy", String(lastGraphPoint.y));
    }
  };
  const fingerCueOptions = [
    { finger: "Left pinky", letter: "A" },
    { finger: "Left ring", letter: "S" },
    { finger: "Left middle", letter: "D" },
    { finger: "Left index", letter: "F" },
    { finger: "Left index", letter: "G" },
    { finger: "Right index", letter: "H" },
    { finger: "Right index", letter: "J" },
    { finger: "Right middle", letter: "K" },
    { finger: "Right ring", letter: "L" },
    { finger: "Right pinky", letter: "P" },
  ];
  const updateHeroHandGraphic = (handGraphic, finger) => {
    if (!handGraphic) return;
    const handSide = finger.startsWith("Left") ? "L" : "R";
    const targetDigit = finger.split(" ").pop().toLowerCase();
    handGraphic.setAttribute("data-target", targetDigit);
    handGraphic.setAttribute("data-side", handSide);
    handGraphic.querySelector(".hero-hand-side").textContent = handSide;
  };
  const randomizeHeroFingerCue = (fingerCard) => {
    if (!fingerCard) return;
    const fingerName = fingerCard.querySelector(".hero-finger-name");
    const keycap = fingerCard.querySelector(".hero-keycap");
    const handGraphic = fingerCard.querySelector(".hero-finger-hand");
    if (!fingerName || !keycap || !handGraphic) return;
    const previousFinger = fingerName.textContent;
    const previousLetter = keycap.textContent;
    const options = fingerCueOptions.filter((cue) => cue.finger !== previousFinger || cue.letter !== previousLetter);
    const cue = options[Math.floor(Math.random() * options.length)];
    fingerName.textContent = cue.finger;
    keycap.textContent = cue.letter;
    updateHeroHandGraphic(handGraphic, cue.finger);
    fingerCard.setAttribute("aria-label", `Finger cue: ${cue.finger} finger, ${cue.letter}`);
  };
  const handDriftOptions = [
    { message: "Left hand is drifting too far right", correction: "← SHIFT LEFT" },
    { message: "Right hand is drifting too far left", correction: "SHIFT RIGHT →" },
  ];
  const randomizeHeroDrift = (driftCard) => {
    if (!driftCard) return;
    const message = driftCard.querySelector(".hero-drift-message");
    const correction = driftCard.querySelector(".hero-drift-correction");
    if (!message || !correction) return;
    const options = handDriftOptions.filter((cue) => cue.message !== message.textContent);
    const cue = options[Math.floor(Math.random() * options.length)];
    message.textContent = cue.message;
    correction.textContent = cue.correction;
    driftCard.setAttribute("aria-label", `Hand position cue: ${cue.message}`);
  };
  const underusedFingerOptions = [
    "Left pinky", "Left ring", "Left middle", "Left index",
    "Right index", "Right middle", "Right ring", "Right pinky",
  ];
  const randomizeHeroUnderusedFinger = (underusedCard) => {
    if (!underusedCard) return;
    const fingerName = underusedCard.querySelector(".hero-underused-name");
    const handGraphic = underusedCard.querySelector(".hero-finger-hand");
    if (!fingerName || !handGraphic) return;
    const options = underusedFingerOptions.filter((finger) => finger !== fingerName.textContent);
    const finger = options[Math.floor(Math.random() * options.length)];
    fingerName.textContent = finger;
    updateHeroHandGraphic(handGraphic, finger);
    underusedCard.setAttribute("aria-label", `Finger use cue: ${finger} is not being utilized enough`);
  };
  const restingPositionOptions = [
    { finger: "Left pinky", key: "A" }, { finger: "Left ring", key: "S" },
    { finger: "Left middle", key: "D" }, { finger: "Left index", key: "F" },
    { finger: "Right index", key: "J" }, { finger: "Right middle", key: "K" },
    { finger: "Right ring", key: "L" }, { finger: "Right pinky", key: ";" },
  ];
  const randomizeHeroRestingPosition = (restCard) => {
    if (!restCard) return;
    const fingerName = restCard.querySelector(".hero-rest-finger");
    const keycap = restCard.querySelector(".hero-rest-key");
    const handGraphic = restCard.querySelector(".hero-finger-hand");
    if (!fingerName || !keycap || !handGraphic) return;
    const options = restingPositionOptions.filter((cue) => cue.finger !== fingerName.textContent || cue.key !== keycap.textContent);
    const cue = options[Math.floor(Math.random() * options.length)];
    fingerName.textContent = cue.finger;
    keycap.textContent = cue.key;
    updateHeroHandGraphic(handGraphic, cue.finger);
    restCard.setAttribute("aria-label", `Resting position cue: ${cue.finger} finger should rest on ${cue.key}`);
  };
  const randomizeHeroSet = (heroCardSet) => {
    if (!heroCardSet) return;
    randomizeHeroRecord(heroCardSet.querySelector(".hero-card--record"));
    for (const fingerCard of heroCardSet.querySelectorAll(".hero-card--finger")) {
      randomizeHeroFingerCue(fingerCard);
    }
    randomizeHeroDrift(heroCardSet.querySelector(".hero-card--drift"));
    randomizeHeroUnderusedFinger(heroCardSet.querySelector(".hero-card--underused"));
    randomizeHeroRestingPosition(heroCardSet.querySelector(".hero-card--rest"));
  };
  randomizeHeroSet(leftHeroCardCarousel?.querySelector(".hero-card-set"));
  const rightHeroCardCarousel = leftHeroCardCarousel?.cloneNode(true);
  if (rightHeroCardCarousel) {
    rightHeroCardCarousel.classList.add("hero-card-carousel--right");
    rightHeroCardCarousel.setAttribute("aria-hidden", "true");
    randomizeHeroSet(rightHeroCardCarousel.querySelector(".hero-card-set"));
    leftHeroCardCarousel.after(rightHeroCardCarousel);
  }
  const heroCardTrack = leftHeroCardCarousel?.querySelector(".hero-card-track");
  const rightHeroCardTrack = rightHeroCardCarousel?.querySelector(".hero-card-track");
  const firstHeroCardSet = heroCardTrack?.querySelector(".hero-card-set");
  for (const track of [heroCardTrack, rightHeroCardTrack]) {
    const firstSet = track?.querySelector(".hero-card-set");
    if (track && firstSet) {
      while (track.children.length < 24) {
        const repeatedSet = firstSet.cloneNode(true);
        repeatedSet.setAttribute("aria-hidden", "true");
        randomizeHeroSet(repeatedSet);
        track.append(repeatedSet);
      }
    }
  }
  let carouselStarted = false;
  let carouselRun = 0;
  let carouselFrameId = null;
  let skipCarouselResume = false;
  let removeCarouselResizeListener = () => {};
  const resetHeroCardCarousel = () => {
    carouselRun += 1;
    carouselStarted = false;
    skipCarouselResume = true;
    if (carouselFrameId !== null) cancelAnimationFrame(carouselFrameId);
    carouselFrameId = null;
    removeCarouselResizeListener();
    removeCarouselResizeListener = () => {};
    heroCardTrack?.style.removeProperty("transform");
    rightHeroCardTrack?.style.removeProperty("transform");
  };
  const startHeroCardCarousel = () => {
    if (carouselStarted) return;
    if (carouselStarted || !heroCardTrack || !rightHeroCardTrack || !firstHeroCardSet) return;
    carouselStarted = true;
    const run = ++carouselRun;

    const burstSeconds = 0.5;
    const accelerationSeconds = 0.2;
    const slowdownSeconds = 2;
    const fastSetsPerSecond = 28;
    const baseSetsPerSecond = 3 / 16;
    const slowdownDistance = 8;
    // Ease into top speed quickly, then keep the burst phase at its existing half-second total.
    const burstDistance = fastSetsPerSecond * (burstSeconds - accelerationSeconds / 2);
    const settledDistance = burstDistance + slowdownDistance;
    const slowdownPower = ((fastSetsPerSecond - baseSetsPerSecond) * slowdownSeconds) /
      (slowdownDistance - baseSetsPerSecond * slowdownSeconds) - 1;
    const slowdownExtraDistance = (fastSetsPerSecond - baseSetsPerSecond) *
      slowdownSeconds / (slowdownPower + 1);
    let cardSetHeight = firstHeroCardSet.getBoundingClientRect().height;
    let cardSetWidth = firstHeroCardSet.getBoundingClientRect().width;
    let leftCarouselWidth = leftHeroCardCarousel.getBoundingClientRect().width;
    let rightCarouselHeight = rightHeroCardCarousel.getBoundingClientRect().height;
    let horizontalMode = window.matchMedia("(max-width: 1500px)").matches;
    let leftOffset = horizontalMode ? -leftCarouselWidth - cardSetWidth : -24 * cardSetHeight;
    let rightOffset = horizontalMode ? leftCarouselWidth : rightCarouselHeight;
    let previousTravelledSets = 0;
    const measureCarousel = () => {
      const measuredHeight = firstHeroCardSet.getBoundingClientRect().height;
      const measuredWidth = firstHeroCardSet.getBoundingClientRect().width;
      const measuredCarouselWidth = leftHeroCardCarousel.getBoundingClientRect().width;
      const measuredRightHeight = rightHeroCardCarousel.getBoundingClientRect().height;
      if (measuredHeight > 0) cardSetHeight = measuredHeight;
      if (measuredWidth > 0) cardSetWidth = measuredWidth;
      if (measuredCarouselWidth > 0) leftCarouselWidth = measuredCarouselWidth;
      if (measuredRightHeight > 0) rightCarouselHeight = measuredRightHeight;
    };
    window.addEventListener("resize", measureCarousel);
    removeCarouselResizeListener = () => window.removeEventListener("resize", measureCarousel);

    let startTime = performance.now();
    let pausedAt = null;
    const moveCards = (now) => {
      if (run !== carouselRun) return;
      if (document.querySelector("#screen-landing").hidden) {
        pausedAt = now;
        carouselFrameId = null;
        return;
      }
      const elapsed = Math.max(0, (now - startTime) / 1000);
      let traveledSets;
      if (elapsed < accelerationSeconds) {
        const progress = elapsed / accelerationSeconds;
        const easedDistance = progress ** 3 - 0.5 * progress ** 4;
        traveledSets = fastSetsPerSecond * accelerationSeconds * easedDistance;
      } else if (elapsed < burstSeconds) {
        traveledSets = fastSetsPerSecond * accelerationSeconds * 0.5 +
          fastSetsPerSecond * (elapsed - accelerationSeconds);
      } else if (elapsed < burstSeconds + slowdownSeconds) {
        const slowElapsed = elapsed - burstSeconds;
        const remaining = 1 - slowElapsed / slowdownSeconds;
        const traveled = baseSetsPerSecond * slowElapsed + slowdownExtraDistance *
          (1 - remaining ** (slowdownPower + 1));
        traveledSets = burstDistance + traveled;
      } else {
        const baseElapsed = elapsed - burstSeconds - slowdownSeconds;
        traveledSets = settledDistance + baseSetsPerSecond * baseElapsed;
      }
      const isHorizontal = window.matchMedia("(max-width: 1500px)").matches;
      if (isHorizontal !== horizontalMode) {
        horizontalMode = isHorizontal;
        leftOffset = isHorizontal ? -cardSetWidth : -2 * cardSetHeight;
        rightOffset = isHorizontal ? 0 : -2 * cardSetHeight;
        previousTravelledSets = traveledSets;
      }
      const distanceInSets = Math.max(0, traveledSets - previousTravelledSets);
      previousTravelledSets = traveledSets;
      if (horizontalMode) {
        leftOffset += distanceInSets * cardSetWidth;
        rightOffset -= distanceInSets * cardSetWidth;
        while (leftOffset >= -cardSetWidth) {
          const recycledSet = heroCardTrack.lastElementChild;
          randomizeHeroSet(recycledSet);
          heroCardTrack.prepend(recycledSet);
          leftOffset -= cardSetWidth;
        }
        while (rightOffset <= -cardSetWidth) {
          const recycledSet = rightHeroCardTrack.firstElementChild;
          randomizeHeroSet(recycledSet);
          rightHeroCardTrack.append(recycledSet);
          rightOffset += cardSetWidth;
        }
        heroCardTrack.style.transform = `translate3d(${leftOffset}px, 0, 0)`;
        rightHeroCardTrack.style.transform = `translate3d(${rightOffset}px, 0, 0)`;
      } else {
        leftOffset += distanceInSets * cardSetHeight;
        rightOffset -= distanceInSets * cardSetHeight;
        while (leftOffset >= -2 * cardSetHeight) {
          const recycledSet = heroCardTrack.lastElementChild;
          randomizeHeroSet(recycledSet);
          heroCardTrack.prepend(recycledSet);
          leftOffset -= cardSetHeight;
        }
        while (rightOffset <= -2 * cardSetHeight) {
          const recycledSet = rightHeroCardTrack.firstElementChild;
          randomizeHeroSet(recycledSet);
          rightHeroCardTrack.append(recycledSet);
          rightOffset += cardSetHeight;
        }
        heroCardTrack.style.transform = `translate3d(0, ${leftOffset}px, 0)`;
        rightHeroCardTrack.style.transform = `translate3d(0, ${rightOffset}px, 0)`;
      }
      carouselFrameId = requestAnimationFrame(moveCards);
    };
    screenEnterHandlers.landing = () => {
      if (skipCarouselResume) {
        skipCarouselResume = false;
        return;
      }
      if (pausedAt === null) return;
      startTime += performance.now() - pausedAt;
      pausedAt = null;
      measureCarousel();
      carouselFrameId = requestAnimationFrame(moveCards);
    };
    carouselFrameId = requestAnimationFrame(moveCards);
  };
  const updateHeaderShadow = () => {
    const landingVisible = !document.querySelector("#screen-landing").hidden;
    const pastHero = landingVisible && landingStage.getBoundingClientRect().bottom <= appHeader.offsetHeight;
    appHeader.classList.toggle("is-scrolled", pastHero);
    if (pastHero) $("landing-nav-how").setAttribute("aria-current", "location");
    else $("landing-nav-how").removeAttribute("aria-current");
  };
  window.addEventListener("scroll", updateHeaderShadow, { passive: true });
  window.addEventListener("resize", updateHeaderShadow);
  updateHeaderShadow();
  let introRun = 0;
  const animateTyping = async (run) => {
    const isCurrent = () => run === introRun;
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const type = async (text, delay, target = ui.typingCopy) => {
      for (const character of text) {
        if (!isCurrent()) return false;
        target.textContent += character;
        await pause(delay);
      }
      return isCurrent();
    };
    const backspace = async (count, delay, target = ui.typingCopy) => {
      for (let i = 0; i < count; i += 1) {
        if (!isCurrent()) return false;
        target.textContent = target.textContent.slice(0, -1);
        await pause(delay);
      }
      return isCurrent();
    };

    ui.typingCopy.textContent = "";
    await pause(1000);
    if (!isCurrent() || !await type("Type fast", 55)) return;
    const typo = document.createElement("span");
    typo.className = "typing-error";
    ui.typingCopy.append(typo);
    if (!await type("re", 55, typo)) return;
    await pause(100);
    if (!isCurrent() || !await backspace(2, 55, typo)) return;
    typo.remove();
    if (!await type("er", 55)) return;
    await pause(500);
    if (!isCurrent() || !await type(" - with ", 38)) return;
    landingStage.classList.add("real-arriving");
    startHeroCardCarousel();
    if (!await type("REAL", 18)) return;
    await pause(600);
    if (isCurrent()) await type(" feedback.", 18);
  };

  const startLandingIntro = () => {
    introRun += 1;
    const run = introRun;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      ui.typingCopy.textContent = "Type faster - with REAL feedback.";
      landingStage.classList.add("real-arriving");
      return;
    }
    animateTyping(run);
  };
  const resetStoryAnimations = () => {
    storyGeneration += 1;
    activeStorySections.clear();
    for (const { section, targets } of storyGroups) {
      storyObserver.unobserve(section);
      for (const target of targets) {
        target.textContent = "";
        const copy = target.closest(".hero-story-copy");
        if (copy) copy.dataset.ghost = "";
        const caret = target.nextElementSibling;
        caret?.classList.remove("is-active");
        const wpmReadout = caret?.nextElementSibling;
        if (wpmReadout) {
          wpmReadout.textContent = "";
          wpmReadout.classList.remove("is-visible");
        }
      }
      storyObserver.observe(section);
    }
  };
  resetLandingAnimations = () => {
    introRun += 1;
    ui.typingCopy.textContent = "";
    landingStage.classList.add("is-resetting");
    landingStage.classList.remove("real-arriving");
    resetHeroCardCarousel();
    resetStoryAnimations();
  };
  startLandingAnimations = () => {
    landingStage.classList.remove("is-resetting");
    startLandingIntro();
  };
  startLandingIntro();
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
  ui.flipToggle.checked = state.settings.flipView;
  for (const radio of ui.facingRadios) radio.checked = radio.value === state.settings.cameraFacing;
}

function applyFlipView() {
  ui.stage.classList.toggle("flipped", state.settings.flipView);
  overlay.setFlipped(state.settings.flipView);
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

function hasSelectedCamera() {
  return !ui.cameraPicker.disabled && ui.cameraPicker.selectedIndex >= 0;
}

function canAdvanceSetupStep() {
  if (state.setupStep === 1) return hasSelectedCamera();
  if (state.setupStep === 2) return ui.setupKeyboardConfirmed.checked;
  if (state.setupStep === 3) return [...ui.facingRadios].some((radio) => radio.checked);
  if (state.setupStep === 4) return state.setupHandsReady;
  return state.setupHandsReady && ui.setupLabelsConfirmed.checked;
}

function updateSetupWizardControls() {
  const visibleStep = state.setupStep - (DEVICE_IS_PHONE ? 1 : 0);
  const visibleStepTotal = DEVICE_IS_PHONE ? 4 : 5;
  ui.setupContinue.disabled = !canAdvanceSetupStep();
  ui.setupContinue.textContent = state.setupStep === 5 ? "Continue" : "Next";
  ui.setupContinue.setAttribute("aria-label", state.setupStep === 5 ? "Continue to calibration" : "Next camera setup step");
  ui.setupStepCount.textContent = `Step ${visibleStep} of ${visibleStepTotal}`;
  ui.setupCameraGroup.hidden = visibleStep > 1;
  ui.setupControlsPanel.classList.toggle("is-past-camera", visibleStep > 1);
  ui.setupCameraGroup.classList.toggle("is-required", state.setupStep === 1 && !hasSelectedCamera());
  ui.setupKeyboardConfirmed.closest(".setup-confirmation").classList.toggle(
    "is-required",
    state.setupStep === 2 && !ui.setupKeyboardConfirmed.checked,
  );
  const hasCameraAngle = [...ui.facingRadios].some((radio) => radio.checked);
  ui.facingRadios[0].closest(".field-group").classList.toggle("is-required", state.setupStep === 3 && !hasCameraAngle);
  ui.setupLiveStatus.classList.toggle("is-required", state.setupStep === 4 && !state.setupHandsReady);
  ui.setupLabelsConfirmed.closest(".setup-confirmation").classList.toggle(
    "is-required",
    state.setupStep === 5 && !ui.setupLabelsConfirmed.checked,
  );
  ui.setupBack.hidden = visibleStep <= 1;
  ui.setupLiveStatus.hidden = state.setupStep < 4;
  overlay.setHandsVisible(state.setupStep >= 4);
  const stepNames = ["Select the right camera", "Check keyboard view", "Choose camera angle", "Show both hands", "Confirm hand labels"];
  updateCameraFlowProgress(visibleStep - 1, stepNames[state.setupStep - 1]);
}

function updateCameraFlowProgress(completedSteps, currentStep) {
  const total = DEVICE_IS_PHONE ? 6 : 7;
  const completed = Math.max(0, Math.min(total, completedSteps));
  const current = Math.min(total, completed + 1);
  const label = `Camera setup · Step ${current} of ${total} · ${currentStep}`;
  for (const progress of ui.cameraFlowProgresses) {
    progress.setAttribute("aria-valuemax", String(total));
    progress.setAttribute("aria-valuenow", String(completed));
    progress.setAttribute("aria-valuetext", label);
    progress.querySelector(".camera-flow-progress-fill").style.width = `${completed / total * 100}%`;
    const tickLayer = progress.querySelector(".camera-flow-progress-ticks");
    if (tickLayer.children.length !== total - 1) {
      tickLayer.replaceChildren(...Array.from({ length: total - 1 }, (_, index) => {
        const tick = document.createElement("span");
        tick.className = "camera-flow-progress-tick";
        tick.style.left = `${(index + 1) / total * 100}%`;
        return tick;
      }));
    }
  }
  for (const progressLabel of ui.cameraFlowProgressLabels) progressLabel.textContent = label;
}

function goToSetupStep(step) {
  const previousStep = state.setupStep;
  const firstStep = DEVICE_IS_PHONE ? 2 : 1;
  state.setupStep = Math.max(firstStep, Math.min(5, step));
  if (state.setupStep === 4 && previousStep === 3) {
    state.bothHandsSince = null;
    state.setupHandsReady = false;
  }
  ui.setupStepPanels.forEach((panel) => {
    const panelStep = Number(panel.dataset.setupStep);
    const active = panelStep === state.setupStep && !(DEVICE_IS_PHONE && panelStep === 1);
    panel.hidden = !active;
    panel.classList.remove("is-entering");
    if (active) {
      void panel.offsetWidth;
      panel.classList.add("is-entering");
    }
  });
  ui.setupStepDots.forEach((dot) => {
    const dotStep = Number(dot.dataset.stepDot);
    dot.hidden = DEVICE_IS_PHONE && dotStep === 1;
    if (dotStep === state.setupStep) dot.setAttribute("aria-current", "step");
    else dot.removeAttribute("aria-current");
    dot.classList.toggle("is-complete", dotStep < state.setupStep);
  });
  updateSetupWizardControls();
  updateOverlayGrid();
}

function resetCameraSetupWizard() {
  state.bothHandsSince = null;
  state.setupHandsReady = false;
  ui.setupKeyboardConfirmed.checked = false;
  ui.setupLabelsConfirmed.checked = false;
  updateCameraViewRotation();
  for (const radio of ui.facingRadios) radio.checked = false;
  goToSetupStep(DEVICE_IS_PHONE ? 2 : 1);
}

function updateCameraViewRotation() {
  ui.stage.classList.toggle("is-rotated", state.settings.rotated);
  overlay.setRotated(state.settings.rotated);
  ui.setupRotateVideo.setAttribute("aria-pressed", String(state.settings.rotated));
  ui.setupRotateVideo.textContent = state.settings.rotated ? "Reset view" : "Rotate view 180°";
}

function updateSetupIndicators(frame) {
  const hasLeft = frame.hands.some((hand) => hand.side === "L");
  const hasRight = frame.hands.some((hand) => hand.side === "R");
  setIndicator(ui.indicatorLeft, hasLeft || state.setupHandsReady);
  setIndicator(ui.indicatorRight, hasRight || state.setupHandsReady);
  ui.positioningTip.textContent = state.setupHandsReady && (!hasLeft || !hasRight)
      ? state.setupStep === 4
      ? "Hands check passed. You can move them out of frame to click Next."
      : "Hands check passed. Bring them back if you need to check the wrist labels."
    : positioningTip(hasLeft, hasRight);

  // Continue unlocks after both hands stay visible for a full second.
  if (hasLeft && hasRight) {
    state.bothHandsSince ??= frame.t;
    if (frame.t - state.bothHandsSince >= SETUP_BOTH_HANDS_REQUIRED_MS) state.setupHandsReady = true;
  } else {
    state.bothHandsSince = null;
  }
  if (state.setupStep >= 4) updateSetupWizardControls();
}

function initSetupScreen() {
  applySettingsToControls();
  applyFlipView();
  updateCameraViewRotation();
  ui.setupRotateVideo.addEventListener("click", () => {
    updateSetting("rotated", !state.settings.rotated);
    updateCameraViewRotation();
    noteIfCalibrationStale();
  });
  ui.flipToggle.addEventListener("change", () => {
    updateSetting("flipView", ui.flipToggle.checked);
    applyFlipView();
  });
  for (const copy of ui.setupPlatformCopy) {
    copy.hidden = DEVICE_IS_PHONE || copy.dataset.platformCopy !== (DEVICE_IS_MAC ? "mac" : "computer");
  }
  screenEnterHandlers.setup = resetCameraSetupWizard;
  for (const button of document.querySelectorAll(".setup-info-trigger")) {
    const panel = document.getElementById(button.getAttribute("aria-controls"));
    panel.addEventListener("close", () => button.setAttribute("aria-expanded", "false"));
    panel.querySelector(".setup-info-close").addEventListener("click", () => panel.close());
    panel.addEventListener("click", (event) => {
      if (event.target === panel) panel.close();
    });
    button.addEventListener("click", () => {
      const willOpen = !panel.open;
      for (const otherButton of document.querySelectorAll(".setup-info-trigger")) {
        const otherPanel = document.getElementById(otherButton.getAttribute("aria-controls"));
        otherButton.setAttribute("aria-expanded", "false");
        if (otherPanel.open) otherPanel.close();
      }
      if (willOpen) {
        button.setAttribute("aria-expanded", "true");
        panel.showModal();
      }
    });
  }
  ui.setupKeyboardConfirmed.addEventListener("change", updateSetupWizardControls);
  ui.setupLabelsConfirmed.addEventListener("change", updateSetupWizardControls);
  ui.mirroredToggle.addEventListener("change", () => {
    updateSetting("mirrored", ui.mirroredToggle.checked);
    noteIfCalibrationStale();
    ui.setupLabelsConfirmed.checked = false;
    updateSetupWizardControls();
  });
  for (const radio of ui.facingRadios) {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      updateSetting("cameraFacing", radio.value);
      noteIfCalibrationStale();
      updateSetupWizardControls();
    });
  }
  ui.cameraPicker.addEventListener("change", () => {
    if (state.screen === "setup") resetCameraSetupWizard();
    startCamera(ui.cameraPicker.value);
  });
  ui.cameraRefresh.addEventListener("click", refreshCameraPicker);
  watchCameraChanges(refreshCameraPicker);
  ui.setupBack.addEventListener("click", () => goToSetupStep(state.setupStep - 1));
  ui.setupContinue.addEventListener("click", () => {
    if (!canAdvanceSetupStep()) return;
    if (state.setupStep === 5) {
      state.dashboardSetupComplete = true;
      showScreen("calibrate");
    }
    else goToSetupStep(state.setupStep + 1);
  });
}

// ---------- Calibrate screen ----------

let calibrationScreen = null;
let gridCapture = null;
let reviewingGrid = false;
let pendingKeyboardGrid = null;

function showCalibrationStep(step) {
  ui.calibrateHomeStep.hidden = step !== "home";
  ui.calibrateGridStep.hidden = step !== "grid";
  const setupChecks = DEVICE_IS_PHONE ? 4 : 5;
  ui.calibrateStepTag.textContent = `step ${setupChecks + (step === "home" ? 1 : 2)}`;
  ui.calibrateTitleText.textContent = step === "home" ? "Calibrate your home row" : "Map your keyboard";
  updateCameraFlowProgress(setupChecks + (step === "home" ? 0 : 1), step === "home" ? "Calibrate hands" : "Map keyboard");
}

function describeSavedCalibration() {
  if (!state.calibration) return "Ready when you are.";
  if (!calibrationMatchesSides(state.calibration, state.settings)) {
    return "The camera settings changed since the saved calibration, so left and right no longer match it. Please calibrate again.";
  }
  const grid = state.calibration.keyboardGrid ? "with a keyboard map" : "without a keyboard map";
  return `A saved calibration exists (${grid}). Calibrate again, or skip to keep using it.`;
}

/**
 * Is the picture on screen turned 180 degrees from the camera image? "Rotate
 * view" and "hands facing me" each turn it once, so both together cancel out
 * (the same rule as the .stage CSS and overlay.js).
 */
function displayTurned() {
  return Boolean(state.settings.rotated) !== Boolean(state.settings.flipView);
}

/** The calibration, or null when it was made with different left/right settings. */
function usableCalibration() {
  return calibrationMatchesSides(state.calibration, state.settings) ? state.calibration : null;
}

/** After a left/right setting changes, say so if the saved calibration no longer fits. */
function noteIfCalibrationStale() {
  const stale = state.calibration && !calibrationMatchesSides(state.calibration, state.settings);
  showMessage(ui.setupNotice, stale ? "Left and right changed, so the saved calibration no longer matches. You will calibrate again in the next steps." : "");
}

function gridDiscPosition(point) {
  const rect = ui.stage.getBoundingClientRect();
  const videoWidth = ui.video.videoWidth;
  const videoHeight = ui.video.videoHeight;
  if (!rect.width || !rect.height || !videoWidth || !videoHeight) return null;
  const scale = Math.min(rect.width / videoWidth, rect.height / videoHeight);
  const imageWidth = videoWidth * scale;
  const imageHeight = videoHeight * scale;
  const displayX = displayTurned() ? 1 - point.x : point.x;
  const displayY = displayTurned() ? 1 - point.y : point.y;
  return {
    left: ((rect.width - imageWidth) / 2 + displayX * imageWidth) / rect.width * 100,
    top: ((rect.height - imageHeight) / 2 + displayY * imageHeight) / rect.height * 100,
  };
}

function renderGridMapDiscs(touches) {
  for (const disc of ui.gridMapDiscs) {
    const point = touches?.[disc.dataset.gridCode];
    const position = point ? gridDiscPosition(point) : null;
    if (!position) {
      ui.gridDiscTray.append(disc);
      disc.style.removeProperty("left");
      disc.style.removeProperty("top");
      disc.classList.remove("is-placed");
      continue;
    }
    ui.gridDiscLayer.append(disc);
    disc.style.left = `${position.left}%`;
    disc.style.top = `${position.top}%`;
    disc.classList.add("is-placed");
    const label = disc.textContent.trim();
    disc.setAttribute("aria-label", `${label} marker placed on the keyboard. Drag to reposition.`);
  }
}

function startGridStep() {
  reviewingGrid = false;
  pendingKeyboardGrid = null;
  ui.gridCaptureButtons.hidden = false;
  ui.gridReviewButtons.hidden = true;
  showCalibrationStep("grid");
  ui.gridTitle.focus();
  ui.stage.classList.add("is-mapping");
  gridCapture.start();
  updateOverlayGrid();
}

function initCalibrateScreen() {
  calibrationScreen = createCalibrationScreen({
    elements: {
      countdown: ui.calibrateCountdown,
      progress: ui.calibrateProgress,
      status: ui.calibrateStatus,
      startButton: ui.calibrateStart,
    },
    pipeline,
    // The home row is saved already; the keyboard map comes next. A new home
    // row calibration drops any old map, because the camera may have moved.
    onSuccess: (calibration) => {
      state.calibration = { ...calibration, sides: sideSettingsOf(state.settings) };
      saveCalibration(state.calibration);
      startGridStep();
    },
  });
  gridCapture = createKeyboardGridCapture({
    elements: { prompt: ui.gridPrompt, steps: ui.gridSteps, status: ui.gridStatus },
    getHomeRow: () => state.calibration,
    onProgress: (touches) => {
      overlay.setKeyboardTouches(touches);
      renderGridMapDiscs(touches);
    },
    onGrid: (grid) => {
      if (!grid) {
        pendingKeyboardGrid = null;
        reviewingGrid = false;
        ui.gridCaptureButtons.hidden = false;
        ui.gridReviewButtons.hidden = true;
        ui.stage.classList.add("is-mapping");
        updateOverlayGrid();
        return;
      }
      const wasReviewing = reviewingGrid;
      pendingKeyboardGrid = grid;
      reviewingGrid = true;
      ui.stage.classList.remove("is-mapping");
      ui.gridCaptureButtons.hidden = true;
      ui.gridReviewButtons.hidden = false;
      ui.gridStatus.textContent =
        `${grid.homeRowWarning ?? "Keyboard map ready."} Drag any disc to adjust it before finishing.`;
      updateOverlayGrid();
      if (!wasReviewing) ui.gridContinue.focus();
    },
  });
  screenEnterHandlers.calibrate = () => {
    calibrationScreen.reset();
    gridCapture.stop();
    reviewingGrid = false;
    pendingKeyboardGrid = null;
    ui.stage.classList.remove("is-mapping");
    showCalibrationStep("home");
    ui.calibrateStatus.textContent = describeSavedCalibration();
  };
  let activeDiscDrag = null;
  const moveDisc = (event) => {
    if (!activeDiscDrag || event.pointerId !== activeDiscDrag.pointerId) return;
    activeDiscDrag.preview.style.left = `${event.clientX}px`;
    activeDiscDrag.preview.style.top = `${event.clientY}px`;
  };
  const finishDiscDrag = (event, drop) => {
    if (!activeDiscDrag || event.pointerId !== activeDiscDrag.pointerId) return;
    const drag = activeDiscDrag;
    activeDiscDrag = null;
    drag.preview.remove();
    if (!drop || state.screen !== "calibrate" || ui.calibrateGridStep.hidden || !gridCapture.running) return;
    const point = pointInVideoFrame(
      event.clientX,
      event.clientY,
      ui.stage.getBoundingClientRect(),
      ui.video.videoWidth,
      ui.video.videoHeight,
    );
    if (!point) {
      ui.gridStatus.textContent = "Drop each disc on the camera image, over the center of its matching key.";
      return;
    }
    if (displayTurned()) {
      point.x = 1 - point.x;
      point.y = 1 - point.y;
    }
    gridCapture.handlePoint(drag.code, point);
  };
  const beginDiscDrag = (event) => {
    if (event.button !== 0 || state.screen !== "calibrate" || ui.calibrateGridStep.hidden || !gridCapture.running) return;
    const disc = event.target.closest(".grid-map-disc");
    if (!disc || activeDiscDrag) return;
    event.preventDefault();
    const rect = disc.getBoundingClientRect();
    const preview = disc.cloneNode(true);
    preview.classList.add("is-drag-preview");
    preview.style.width = `${rect.width}px`;
    preview.style.height = `${rect.height}px`;
    preview.style.left = `${event.clientX}px`;
    preview.style.top = `${event.clientY}px`;
    document.body.append(preview);
    activeDiscDrag = { code: disc.dataset.gridCode, pointerId: event.pointerId, preview };
  };
  ui.gridDiscTray.addEventListener("pointerdown", beginDiscDrag);
  ui.gridDiscLayer.addEventListener("pointerdown", beginDiscDrag);
  document.addEventListener("pointermove", moveDisc);
  document.addEventListener("pointerup", (event) => finishDiscDrag(event, true));
  document.addEventListener("pointercancel", (event) => finishDiscDrag(event, false));
  ui.calibrateStart.addEventListener("click", () => calibrationScreen.start());
  ui.calibrateSkip.addEventListener("click", () => openTypingTest("choose"));
  ui.gridRestart.addEventListener("click", startGridStep);
  ui.gridRedo.addEventListener("click", startGridStep);
  const finishStepSeven = () => {
    if (pendingKeyboardGrid) {
      state.calibration = { ...state.calibration, keyboardGrid: pendingKeyboardGrid };
      saveCalibration(state.calibration);
    }
    pendingKeyboardGrid = null;
    reviewingGrid = false;
    state.dashboardSetupComplete = true;
    state.hasCompletedCameraSetup = true;
    storage.setJSON(KEYS.cameraSetupCompleted, true);
    ui.stage.classList.remove("is-mapping");
    gridCapture.stop();
    openDashboard();
  };
  ui.gridSkip.addEventListener("click", finishStepSeven);
  ui.gridContinue.addEventListener("click", () => {
    if (!pendingKeyboardGrid) return;
    finishStepSeven();
  });
}

/**
 * Draw the keyboard map on the video while it is being checked on the
 * Calibrate screen, or anywhere when the debug checkbox asks for it.
 */
function updateOverlayGrid() {
  const reviewing = state.screen === "calibrate" && reviewingGrid;
  const grid = reviewing ? pendingKeyboardGrid : state.calibration?.keyboardGrid ?? null;
  overlay.setKeyboardGrid(reviewing || ui.debugShowGrid.checked ? grid : null);
  const showHover = reviewing || state.screen === "setup" || state.screen === "exercise";
  overlay.setHoverGrid(showHover ? grid : null);
  const setupLabels = state.screen === "setup" && state.setupStep >= 4;
  const debugLabels = state.screen === "exercise" && !ui.debugPanel.hidden;
  overlay.setFingerLabels(setupLabels || reviewing || debugLabels);
  overlay.setSideLabels(state.screen !== "exercise" || debugLabels);
  ui.debugGridStatus.textContent = grid
    ? `${reviewing ? "Keyboard map preview" : `Keyboard map from ${grid.createdAt}`}, home row fit ${grid.homeRowErrorKeys?.toFixed(2) ?? "?"} keys.`
    : "No keyboard map in the current calibration.";
}

// ---------- Choose screen ----------

function exerciseProgress() {
  const progress = storage.getJSON(KEYS.exerciseProgress, {});
  return progress && typeof progress === "object" ? progress : {};
}

function nextExerciseIndex(levelId) {
  const saved = Number(exerciseProgress()[levelId] ?? 0);
  return Number.isFinite(saved) ? Math.max(0, Math.floor(saved)) : 0;
}

function advanceExerciseIndex(levelId, finishedIndex) {
  storage.setJSON(KEYS.exerciseProgress, {
    ...exerciseProgress(),
    [levelId]: Math.max(nextExerciseIndex(levelId), finishedIndex + 1),
  });
}

function renderLevelList(container = ui.levelList) {
  renderLessonPaths(container, { progress: exerciseProgress(), onSelect: startExercise });
}

function initTutorialScreen() {
  tutorialScreen = createTutorialScreen({
    checkFinger: checkTutorialFinger,
    elements: {
      kicker: $("tutorial-kicker"),
      title: $("tutorial-title"),
      intro: $("tutorial-intro"),
      text: $("tutorial-text"),
      tip: $("tutorial-tip"),
      keyboard: $("tutorial-keyboard"),
      keyCards: $("tutorial-key-cards"),
      handGuide: $("tutorial-hand-guide"),
      handCaption: $("tutorial-hand-caption"),
      prompt: $("tutorial-prompt"),
      status: $("tutorial-status"),
      startButton: $("tutorial-start"),
    },
  });
  $("tutorial-start").addEventListener("click", () => tutorialScreen.start());
  $("tutorial-skip").addEventListener("click", () => tutorialScreen.start());
  screenEnterHandlers.tutorial = () => resumeCameraForPractice(ui.tutorialCameraStatus);
}

async function checkTutorialFinger(keyEvent, expected) {
  const unavailable = { status: "unavailable", used: null, confidence: null };
  if (!state.dashboardSetupComplete || !state.stream || !state.tracker?.running || !usableCalibration() || pipeline.source !== "live") {
    return unavailable;
  }
  await new Promise((resolve) => setTimeout(resolve, ATTRIBUTION_DELAY_MS));
  if (state.screen !== "tutorial") return unavailable;
  const { result, problem } = runAttribution(attributeKeystroke, keyEvent, frameBuffer, usableCalibration());
  if (problem) console.warn(problem);
  return evaluateAttribution(result, expected);
}

function initChooseScreen() {
  screenEnterHandlers.choose = () => {
    renderLevelList();
    renderHistory(ui.historyChoose, storage.loadHistory());
  };
  ui.chooseBackSetup.addEventListener("click", openCameraSetup);
  ui.chooseRecalibrate.addEventListener("click", () => showScreen("calibrate"));
}

// ---------- Exercise screen ----------

// Level 1 and 2 exercises open with a tutorial page first (exercises.js#getTutorial).
let tutorialScreen = null;

function startExercise(levelId, exerciseIndex, { skipTutorial = false } = {}) {
  const tutorial = skipTutorial ? null : getTutorial(levelId, exerciseIndex);
  if (tutorial) {
    tutorialScreen.open(tutorial, () => startExercise(levelId, exerciseIndex, { skipTutorial: true }));
    showScreen("tutorial");
    return;
  }
  const title = `${LEVELS.find((l) => l.id === levelId).title}, exercise ${exerciseIndex + 1}`;
  startExerciseWithText(getExerciseText(levelId, exerciseIndex), { levelId, exerciseIndex }, title);
}

function startExerciseWithText(text, info, title) {
  state.exerciseRunId += 1;
  clearLessonRecording();
  state.lastExercise = { text, info, title };
  state.session = new TypingSession(text, info);
  state.exerciseActive = true;
  ui.exerciseTitle.textContent = title;
  ui.replayBadge.hidden = pipeline.source !== "replay";
  ui.attributionBadge.hidden = ATTRIBUTION_IMPLEMENTED;
  overlay.clearFlash();
  renderTargetText();
  setFeedback("Start typing when ready.", "idle");
  updateExerciseDisplay();
  showScreen("exercise").then(() => {
    ui.typingArea.focus({ preventScroll: true });
    resumeCameraForPractice();
  });
}

async function resumeCameraForPractice(statusElement = ui.exerciseCameraStatus) {
  statusElement.hidden = true;
  // The app closes camera tracks when leaving setup for the dashboard. Reopen
  // the selected device for lessons that have completed camera calibration.
  if (!state.dashboardSetupComplete || (statusElement === ui.tutorialCameraStatus && !usableCalibration())) {
    if (statusElement === ui.tutorialCameraStatus) {
      statusElement.hidden = false;
      statusElement.textContent = "Camera calibration is unavailable for this visit. The walkthrough will check keys only.";
    }
    return;
  }
  statusElement.hidden = false;
  statusElement.textContent = "Reconnecting the camera for finger coaching…";
  if (!cameraAllowedHere()) {
    statusElement.textContent = CAMERA_ERROR_TEXT.insecure;
    return;
  }
  state.setupStarted = true;
  if (!state.stream) await startCamera(rememberedCamera());
  if (!state.stream) {
    statusElement.textContent = ui.setupError.textContent || CAMERA_ERROR_TEXT.unknown;
    return;
  }
  if (statusElement === ui.exerciseCameraStatus && state.screen === "exercise" && state.exerciseActive
    && state.session && lessonRecordingSession !== state.session && pipeline.source !== "replay") {
    if (lessonVideo.start(state.stream, { rotated: state.settings.rotated, flipped: state.settings.flipView })) {
      lessonRecordingSession = state.session;
    }
  }
  if (!state.tracker?.running) await startTracking();
  if (!state.tracker?.running) {
    statusElement.textContent = ui.setupError.textContent || "Camera is on, but hand tracking is unavailable.";
    return;
  }
  if (statusElement === ui.exerciseCameraStatus && lessonRecordingSession === state.session) {
    statusElement.textContent = "Camera recording for this lesson's replay. Video stays in this tab.";
    statusElement.hidden = false;
  } else {
    statusElement.hidden = true;
  }
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
  if (keystroke.kind === "char" && !keystroke.correct) beatFlash.beat("bad");
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
  const { result, problem } = runAttribution(attributeKeystroke, keyEvent, frameBuffer, usableCalibration());
  const check = evaluateAttribution(result, keystroke.expectedFingers);
  const marks = check.status === "wrong" && keystroke.kind === "char"
    ? captureFingerMarks(frameBuffer, keyEvent.t, check.used, keystroke.expectedFingers) : null;
  session.recordFingerCheck(keystroke.id, check, marks);
  ui.debugLastAttribution.textContent = problem ?? (result ? `${result.finger} (${result.confidence.toFixed(2)})` : "null");
  if (problem) console.warn(problem);
  // Only update the screen if this keystroke belongs to the exercise on screen.
  if (session === state.session && state.screen === "exercise") {
    const targets = { textElement: ui.feedbackText, overlay };
    if (keystroke.kind === "char" && !keystroke.correct) {
      showWrongKey(targets, keystroke.key, keystroke.targetChar);
    } else {
      showFingerCheck(targets, check, keystroke.expectedFingers);
      beatFlash.beat(beatKind(keystroke, check));
    }
  }
}

function waitForFingerChecks() {
  if (state.pendingFingerChecks === 0) return Promise.resolve();
  return new Promise((resolve) => state.fingerCheckWaiters.push(resolve));
}

function quitExercise() {
  state.exerciseRunId += 1;
  replayer.stop();
  state.exerciseActive = false;
  state.session = null;
  clearLessonRecording();
  showScreen("choose");
}

async function finishExercise() {
  state.exerciseActive = false;
  const session = state.session;
  const runId = state.exerciseRunId;
  await waitForFingerChecks(); // the last keystroke's check arrives a moment later
  if (runId !== state.exerciseRunId) return;
  await lessonVideo.stop();
  if (runId !== state.exerciseRunId) return;
  state.lastSummary = session.summary();
  // Replays are for debugging, so they do not count as practice in the history.
  if (pipeline.source !== "replay") {
    if (session.levelId != null) advanceExerciseIndex(session.levelId, session.exerciseIndex);
    storage.addToHistory(historyEntry(state.lastSummary));
  }
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

function showSummary() {
  if (!state.lastSummary) return;
  ui.mistakeReplaySection.hidden = !(state.lastSummary.wrongFingerEvents?.length > 0);
  const { levelId, exerciseIndex } = state.lastSummary;
  const levelPosition = LEVELS.findIndex((level) => level.id === levelId);
  const level = LEVELS[levelPosition];
  const hasNextLesson = level && (exerciseIndex + 1 < level.items.length || levelPosition + 1 < LEVELS.length);
  renderSummary(
    {
      headline: ui.summaryHeadline,
      wpm: ui.summaryWpm,
      charAccuracy: ui.summaryCharAccuracy,
      fingerAccuracy: ui.summaryFingerAccuracy,
      histogram: ui.summaryHistogram,
      histogramNote: ui.histogramNote,
      substitutions: ui.summarySubstitutions,
    },
    state.lastSummary,
  );
  renderPracticeRecommendations(
    ui.summaryFeedbackCards,
    ui.summaryNextNote,
    state.lastSummary,
    (drill) => startExerciseWithText(drill.text, { levelId: null, exerciseIndex: null }, drill.title),
    () => {
      if (levelPosition < 0) return openDashboardLessons();
      if (exerciseIndex + 1 < level.items.length) return startExercise(levelId, exerciseIndex + 1);
      const nextLevel = LEVELS[levelPosition + 1];
      if (nextLevel) return startExercise(nextLevel.id, 0);
      return openDashboardLessons();
    },
    hasNextLesson ? "Try the next lesson" : "Choose a lesson",
  );
  renderHistory(ui.historySummary, storage.loadHistory());
  if (!ui.mistakeReplaySection.hidden) showMistakeReplay();
}

function clearLessonRecording() {
  stopMistakeReplay();
  ui.mistakeReplayVideo.pause();
  ui.mistakeReplayVideo.playbackRate = 1;
  ui.mistakeReplayVideo.removeAttribute("src");
  ui.mistakeReplayVideo.load();
  drawReplayMarks(ui.mistakeReplayOverlay, null);
  lessonVideo.clear();
  lessonRecordingSession = null;
  lessonTrackingFrames = [];
}

function replayTimeFor(mistake) {
  if (!lessonVideo.clip || !Number.isFinite(mistake?.t)) return 0;
  const clip = lessonVideo.clip;
  return Math.min(clip.durationMs / 1000, timeInClip(mistake.t, clip) + 0.1);
}

function replayFeedbackText(mistake) {
  const pressed = mistake.typedChar === " " ? "Space" : `“${mistake.typedChar.toUpperCase()}”`;
  const target = mistake.targetChar === " " ? "Space" : `“${mistake.targetChar.toUpperCase()}”`;
  const fingerMessage = feedbackMessage({ status: "wrong", used: mistake.used }, mistake.expected);
  const keyContext = mistake.correctKey ? `on ${target}` : `on ${target} (you typed ${pressed} instead)`;
  return fingerMessage.replace(/^(Wrong (?:finger|hand)):/, `$1 ${keyContext}:`);
}

function seekToMistake(index) {
  mistakeReplayIndex = index;
  const mistake = state.lastSummary?.wrongFingerEvents?.[index];
  renderMistakeReplayFrame();
  if (lessonVideo.clip && mistake && ui.mistakeReplayVideo.readyState > 0) {
    ui.mistakeReplayVideo.pause();
    const targetTime = replayTimeFor(mistake);
    if (Math.abs(ui.mistakeReplayVideo.currentTime - targetTime) > 0.015) {
      ui.mistakeReplayVideo.currentTime = targetTime;
    } else {
      renderReplayFreezeFrame();
    }
  }
}

function stopMistakeReplay() {
  ui.mistakeReplayVideo.pause();
  ui.mistakeReplayVideo.playbackRate = 1;
}

function renderReplayFreezeFrame() {
  if (!lessonVideo.clip) return;
  const mistake = state.lastSummary?.wrongFingerEvents?.[mistakeReplayIndex];
  if (!mistake) return;
  const marks = followingFingerMarks(lessonTrackingFrames,
    lessonVideo.clip.startedAt + ui.mistakeReplayVideo.currentTime * 1000,
    mistake.used, mistake.expected);
  drawReplayMarks(ui.mistakeReplayOverlay, marks, {
    rotated: lessonVideo.clip.rotated,
    flipped: lessonVideo.clip.flipped,
  });
}

function renderMistakeReplayFrame() {
  const mistakes = state.lastSummary?.wrongFingerEvents ?? [];
  const mistake = mistakes[mistakeReplayIndex];
  if (!mistake) return;
  ui.mistakeReplayProgress.textContent = `Mistake ${mistakeReplayIndex + 1} of ${mistakes.length}`;
  mistakeReplaySpans.forEach((span) => span.classList.remove("is-current"));
  mistakeReplaySpans[mistake.position]?.classList.add("is-current");

  ui.mistakeReplayMessage.textContent = replayFeedbackText(mistake);
  ui.mistakeReplayPrev.disabled = mistakeReplayIndex === 0;
  ui.mistakeReplayNext.disabled = mistakeReplayIndex === mistakes.length - 1;
}

function showMistakeReplay() {
  stopMistakeReplay();
  const mistakes = state.lastSummary?.wrongFingerEvents ?? [];
  if (!mistakes.length) return;
  const clip = lessonVideo.clip;
  ui.mistakeReplayVideoFrame.hidden = !clip;
  ui.mistakeReplayVideoNote.hidden = Boolean(clip);
  if (!clip) ui.mistakeReplayVideoNote.textContent = "Video was not available for this lesson. You can still step through each mistake here.";
  else {
    ui.mistakeReplayVideoFrame.classList.toggle("is-rotated", clip.rotated);
    ui.mistakeReplayVideoFrame.classList.toggle("is-flipped", clip.flipped);
    ui.mistakeReplayVideo.src = clip.url;
    ui.mistakeReplayVideo.load();
  }
  const markedPositions = new Set(mistakes.map((mistake) => mistake.position));
  mistakeReplaySpans = [...state.lastSummary.targetText].map((char, position) => {
    const span = document.createElement("span");
    span.textContent = char;
    if (markedPositions.has(position)) span.classList.add("is-mistake");
    return span;
  });
  ui.mistakeReplayPassage.replaceChildren(...mistakeReplaySpans);
  mistakeReplayIndex = 0;
  renderMistakeReplayFrame();
  if (!clip) return;
  if (ui.mistakeReplayVideo.readyState > 0) seekToMistake(0);
}

function initSummaryScreen() {
  screenEnterHandlers.summary = showSummary;
  ui.summaryAgain.addEventListener("click", () => {
    if (pipeline.source === "replay") return showScreen("choose");
    if (!state.lastExercise) return showScreen("choose");
    const { text, info, title } = state.lastExercise;
    startExerciseWithText(text, info, title);
  });
  ui.summaryChoose.addEventListener("click", openDashboardLessons);
  ui.mistakeReplayPrev.addEventListener("click", () => {
    seekToMistake(Math.max(0, mistakeReplayIndex - 1));
  });
  ui.mistakeReplayNext.addEventListener("click", () => {
    seekToMistake(Math.min((state.lastSummary?.wrongFingerEvents?.length ?? 1) - 1, mistakeReplayIndex + 1));
  });
  ui.mistakeReplayVideo.addEventListener("loadedmetadata", () => {
    if (state.screen !== "summary" || !lessonVideo.clip) return;
    ui.mistakeReplayOverlay.width = ui.mistakeReplayVideo.videoWidth;
    ui.mistakeReplayOverlay.height = ui.mistakeReplayVideo.videoHeight;
    seekToMistake(mistakeReplayIndex);
  });
  ui.mistakeReplayVideo.addEventListener("loadeddata", renderReplayFreezeFrame);
  ui.mistakeReplayVideo.addEventListener("seeked", renderReplayFreezeFrame);
  ui.mistakeReplayVideo.addEventListener("error", () => {
    if (state.screen !== "summary") return;
    ui.mistakeReplayVideoNote.hidden = false;
    ui.mistakeReplayVideoNote.textContent = "This browser could not show the recording. You can still step through each mistake here.";
    ui.mistakeReplayVideoFrame.hidden = true;
  });
}

// ---------- Keyboard ----------

function initKeyboard() {
  startKeyboardCapture({
    onKey: (keyEvent) => pipeline.ingestKey(keyEvent, "live"),
    // Calibration also uses Space, so stop it scrolling the page there too.
    isExerciseActive: () => state.exerciseActive || state.screen === "calibrate" || state.screen === "tutorial" || (state.screen === "collect" && collection !== null),
    typingArea: ui.typingArea,
  });
}

pipeline.onKey((keyEvent) => {
  if (state.screen === "tutorial") tutorialScreen.handleKey(keyEvent);
  if (state.screen === "exercise" && state.exerciseActive) handleExerciseKey(keyEvent);
  // On the Calibrate screen the thumb on Space starts the capture.
  if (state.screen === "calibrate" && !ui.calibrateHomeStep.hidden && keyEvent.code === "Space" && !calibrationScreen.capturing) {
    calibrationScreen.start();
  }
});

// ---------- Labeled camera recordings (debug) ----------

let collection = null;
let lastCollectHandsShown = null;

function handsVisibleForCollection() {
  const latest = frameBuffer.latest();
  if (!latest || pipeline.source !== "live") return false;
  if (performance.now() - latest.t > DATA_COLLECTION_MAX_FRAME_AGE_MS) return false;
  return latest.hands.some((hand) => hand.side === "L") && latest.hands.some((hand) => hand.side === "R");
}

function showCollectPart(part) {
  ui.collectIntro.hidden = part !== "intro";
  ui.collectRunning.hidden = part !== "running";
  ui.collectDone.hidden = part !== "done";
}

function collectSetupNote() {
  if (!state.tracker?.running || !state.stream) return "Camera tracking is not running. Complete camera setup first.";
  if (!state.calibration) return "No hand calibration yet. Complete camera setup before collecting data.";
  if (!state.calibration.keyboardGrid) return "No keyboard map is saved. You can record, but map the keyboard first for better evaluation.";
  return "Camera and keyboard map ready.";
}

function renderCollectPrompt(message) {
  const { session } = collection;
  const prompt = session.current();
  if (prompt) {
    const keycap = document.createElement("kbd");
    keycap.textContent = prompt.label;
    ui.collectPrompt.replaceChildren("Press ", keycap, describePrompt(prompt).slice(`Press ${prompt.label}`.length));
  } else {
    ui.collectPrompt.textContent = "All done. Saving…";
  }
  ui.collectPrompt.classList.toggle("on-purpose", Boolean(prompt?.onPurposeWrong));
  const { done, total } = session.progress;
  ui.collectProgressText.textContent = `${done} of ${total} prompts`;
  ui.collectProgress.value = total ? done / total : 0;
  if (message !== undefined) ui.collectStatus.textContent = message;
}

function renderCollectHands() {
  const visible = handsVisibleForCollection();
  if (visible === lastCollectHandsShown) return;
  lastCollectHandsShown = visible;
  ui.collectHands.dataset.on = String(visible);
  ui.collectHands.textContent = visible ? "✓ Both hands visible" : "✗ Waiting for both hands to be in view";
}

function startCollection() {
  if (pipeline.source !== "live" || !state.stream || !state.tracker?.running) {
    ui.collectCalibrationNote.textContent = collectSetupNote();
    return;
  }
  const seed = Math.floor(Math.random() * 2 ** 31);
  const prompts = buildPrompts({ repeats: DATA_COLLECTION_REPEATS, wrongShare: DATA_COLLECTION_WRONG_SHARE, seed });
  const collectionRecorder = new Recorder();
  collectionRecorder.start({
    ...recordingMeta(),
    collection: { seed, repeats: DATA_COLLECTION_REPEATS, wrongShare: DATA_COLLECTION_WRONG_SHARE, prompts: prompts.length },
  });
  collection = { session: createCollectionSession(prompts), recorder: collectionRecorder, seed, finishing: false };
  lastCollectHandsShown = null;
  showCollectPart("running");
  renderCollectPrompt("");
  renderCollectHands();
  ui.collectPrompt.focus();
}

function finishCollection(reason = "") {
  if (!collection) return;
  const { session, recorder: collectionRecorder, seed } = collection;
  collection = null;
  const { done, total } = session.progress;
  const recording = collectionRecorder.stop({ fpsAtStop: state.tracker?.stats.fps ?? null });
  const typist = ui.collectTypist.value.trim();
  recording.labels = session.labels({
    ...(typist ? { typist } : {}),
    source: "data collection run",
    notes: `Data collection run (seed ${seed}), ${done} of ${total} prompts done. ` +
      "Each label is the finger the app asked for; keys that did not match a prompt are skipped.",
  });
  const fileName = downloadRecording(recording, "collection");
  ui.collectResult.textContent = `${reason}Saved ${fileName}: ${recording.keyEvents.length} keys (${session.countedKeys} labeled), ${recording.frames.length} frames.`;
  showCollectPart("done");
  ui.collectAgain.focus();
}

function cancelCollection() {
  if (!collection) return;
  collection.recorder.stop();
  collection = null;
  showCollectPart("intro");
}

function handleCollectionKey(keyEvent) {
  collection.recorder.addKey(keyEvent);
  if (collection.finishing) {
    collection.session.handleKey(keyEvent, { handsVisible: false });
    return;
  }
  const { message } = collection.session.handleKey(keyEvent, { handsVisible: handsVisibleForCollection() });
  renderCollectPrompt(message);
  if (collection.session.finished) {
    collection.finishing = true;
    setTimeout(() => collection && finishCollection(), DATA_COLLECTION_TAIL_MS);
  }
}

async function prepareCollectCamera() {
  ui.collectStart.disabled = true;
  if (pipeline.source !== "live") {
    ui.collectCalibrationNote.textContent = "Wait for the replay to finish before collecting data.";
    return;
  }
  if (!cameraAllowedHere()) {
    ui.collectCalibrationNote.textContent = CAMERA_ERROR_TEXT.insecure;
    return;
  }
  ui.collectCalibrationNote.textContent = "Starting camera tracking…";
  state.setupStarted = true;
  if (!state.stream) await startCamera(rememberedCamera());
  if (state.stream) await startTracking();
  if (state.screen !== "collect") return;
  ui.collectCalibrationNote.textContent = collectSetupNote();
  ui.collectStart.disabled = !state.stream || !state.tracker?.running;
}

function initCollectScreen() {
  screenEnterHandlers.collect = () => {
    if (collection) return;
    showCollectPart("intro");
    prepareCollectCamera();
  };
  ui.collectStart.addEventListener("click", startCollection);
  ui.collectFinish.addEventListener("click", () => finishCollection("Finished early. "));
  ui.collectCancel.addEventListener("click", cancelCollection);
  ui.collectAgain.addEventListener("click", () => screenEnterHandlers.collect());
  ui.collectBack.addEventListener("click", openDashboard);
  ui.collectDoneBack.addEventListener("click", openDashboard);
  ui.debugCollect.addEventListener("click", () => {
    if (!ui.debugPanel.hidden) ui.debugToggle.click();
    state.exerciseActive = false;
    showScreen("collect");
  });
}

pipeline.onFrame((frame, from) => {
  if (from !== "live" || !collection) return;
  collection.recorder.addFrame(frame);
  renderCollectHands();
  if (!collection.recorder.recording) finishCollection("Stopped at the recording size limit. ");
});

pipeline.onKey((keyEvent, from) => {
  if (from === "live" && state.screen === "collect" && collection) handleCollectionKey(keyEvent);
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
    // How late frames reached the app when recording started, so the
    // evaluation script can hold back frames that would not have arrived yet.
    frameLagMs: state.tracker?.stats.lagMs ?? null,
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
    updateOverlayGrid();
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
  updateOverlayGrid();
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
    updateOverlayGrid();
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
  ui.debugShowGrid.addEventListener("change", updateOverlayGrid);
  updateOverlayGrid();
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

pipeline.onFrame((frame, from) => {
  if (from === "live" && state.screen === "exercise" && lessonRecordingSession === state.session
    && lessonVideo.capture?.recorder.state === "recording") {
    const last = lessonTrackingFrames.at(-1);
    if (!last || frame.t - last.t >= 25) lessonTrackingFrames.push(compactReplayFrame(frame));
  }
  overlay.draw(frame);
  if (state.screen === "setup") updateSetupIndicators(frame);
});

// ---------- Start ----------

function start() {
  // Earlier versions saved calibration but did not remember that setup was finished.
  // Read that evidence before discarding the position-specific calibration below.
  if (!state.hasCompletedCameraSetup && (
    Boolean(state.calibration?.baselines) ||
    storage.loadHistory().some((entry) => entry?.fingerAccuracy != null)
  )) {
    state.hasCompletedCameraSetup = true;
    storage.setJSON(KEYS.cameraSetupCompleted, true);
  }
  clearSavedCalibration();
  ui.debugToggle.hidden = !debugAvailable;
  ui.stageCameraOn.addEventListener("click", turnCameraOn);
  initLandingScreen();
  initTypingTestScreen();
  initSetupScreen();
  initCalibrateScreen();
  initChooseScreen();
  initTutorialScreen();
  initExerciseScreen();
  initSummaryScreen();
  initKeyboard();
  initDebugPanel();
  initCollectScreen();
  setInterval(() => {
    checkFps();
    updateDebugStats();
    if (state.screen === "setup") ui.setupFps.textContent = state.tracker?.running ? state.tracker.stats.fps.toFixed(0) : "--";
  }, 1000);

  if (skipSetup) {
    startExercise(1, 0, { skipTutorial: true });
    return;
  }

  showScreen("landing");
}

start();
