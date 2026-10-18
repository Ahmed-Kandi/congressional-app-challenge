// Every tunable number in the app lives here, with the reason for its value.
// Change a value here and the whole app follows; nothing else hard-codes these.

// ---- MediaPipe (the only network requests the app makes) ----

// Exact version from `npm view @mediapipe/tasks-vision version` on 2026-10-19.
// Pinned so a new release can never change behavior the week of the deadline.
export const MEDIAPIPE_VERSION = "1.1.1";
export const MEDIAPIPE_BUNDLE_URL =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
export const MEDIAPIPE_WASM_URL =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
// Official Google-hosted float16 hand model (version 1, the published one).
export const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// Two hands on a keyboard.
export const NUM_HANDS = 2;
// MediaPipe defaults (0.5). Lower finds hands more often but adds false hands.
export const MIN_HAND_DETECTION_CONFIDENCE = 0.5;
export const MIN_HAND_PRESENCE_CONFIDENCE = 0.5;
export const MIN_TRACKING_CONFIDENCE = 0.5;

// ---- Camera ----

// Ask for 720p at up to 60 fps. These are "ideal" hints; the camera may give less.
// Higher fps means more frames around each keystroke, which helps attribution.
export const CAMERA_IDEAL_WIDTH = 1280;
export const CAMERA_IDEAL_HEIGHT = 720;
export const CAMERA_IDEAL_FPS = 60;

// ---- Frames and timing ----

// How much history the frame buffer keeps. 2 s is far more than one keystroke
// needs, but leaves room for slow attribution or a long look-back.
export const FRAME_BUFFER_WINDOW_MS = 2000;

// Wait this long after a key event before asking which finger pressed it.
// Camera frames arrive later than key events, so we wait for the frames that
// show the finger landing on the key to reach the buffer.
export const ATTRIBUTION_DELAY_MS = 120;

// Attribution results below this confidence are shown as "finger check
// unavailable" instead of right or wrong, so a guess never scolds the student.
export const MIN_ATTRIBUTION_CONFIDENCE = 0.5;

// fps is averaged over this window so the display does not jitter.
export const FPS_WINDOW_MS = 1000;
// Below this detection rate a 80 ms finger press spans only one or two frames.
export const LOW_FPS_THRESHOLD = 15;
// Do not warn about low fps until tracking has run this long (startup is slow).
export const LOW_FPS_GRACE_MS = 3000;

// ---- Setup screen ----

// Both hands must stay visible this long before Continue unlocks.
export const SETUP_BOTH_HANDS_REQUIRED_MS = 1000;

// ---- Calibration ----

// Wait after the start key so the thumb that pressed Space can settle.
export const CALIBRATION_SETTLE_MS = 500;
// How long the hands must hold still on the home row.
export const CALIBRATION_DURATION_MS = 3000;
// Share of calibration frames that must contain both hands, or we ask to retry.
export const CALIBRATION_MIN_BOTH_HANDS_RATIO = 0.8;

// ---- Feedback ----

// How long a fingertip flashes green or red after a keystroke.
export const FLASH_DURATION_MS = 400;

// ---- Session statistics ----

// Typing-test convention: one "word" is five characters, spaces included.
export const CHARS_PER_WORD = 5;
// Headline stat: "You used N fingers for 90 percent of your keystrokes".
export const HEADLINE_KEYSTROKE_SHARE = 0.9;
// How many wrong-finger substitutions the summary lists.
export const TOP_SUBSTITUTION_COUNT = 3;
// How many past sessions the history list keeps.
export const HISTORY_LIMIT = 10;
// Live WPM refresh rate while the student is typing.
export const LIVE_STATS_INTERVAL_MS = 500;

// ---- Debug tools ----

// Motion traces show this much time before and after the key event.
export const TRACE_WINDOW_BEFORE_MS = 300;
export const TRACE_WINDOW_AFTER_MS = 300;
// How many past keystrokes the traces view can switch between.
export const TRACE_HISTORY_LIMIT = 50;
// After a replay ends, keep its frames this long so the last keystroke's finger
// check (ATTRIBUTION_DELAY_MS) and motion trace (TRACE_WINDOW_AFTER_MS) can run.
export const REPLAY_END_HOLD_MS = 500;
// Safety cap on a recording (about 5 minutes at 60 fps) so memory stays sane.
export const RECORDING_MAX_FRAMES = 18000;
