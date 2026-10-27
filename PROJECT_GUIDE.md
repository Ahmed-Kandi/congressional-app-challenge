# Project guide

Inspected October 24, 2026. This describes the supplied code, not a promise that every camera feature has been verified on hardware.

## What this app is

The project calls itself **Typing Form Coach**. It combines a typing tutor with camera-based hand tracking. Its intended distinguishing feature is checking whether the student used the correct finger, even when they typed the correct character.

It is plain HTML, CSS, and JavaScript modules. There is no React, build step, account system, database, or application server in this snapshot. The Node server only serves files during development. What the team calls “backend” may mean the tracking and scoring logic, which also runs in the browser.

## User journey

1. **Setup:** choose a camera, orientation, and mirror setting. Hand indicators help position the camera; continuing normally requires both hands to remain visible for one second. There is also a camera-free practice option.
2. **Calibration:** rest on the home row for three seconds to measure resting fingertip positions. A second, skippable step maps the keyboard by pressing Q, P, Z, and / with the indicated index finger. The user can inspect the resulting overlay.
3. **Choose:** eight home-row drills, eight home-row word exercises, and ten full-sentence exercises. Progress is remembered locally.
4. **Exercise:** highlighted text, next-finger hints, WPM, character accuracy, and camera feedback. Backspace allows correction; the original errors still count against character accuracy.
5. **Summary:** session scores, finger-use chart, wrong-finger habits when available, and the last ten sessions.

The screens are sections in one HTML document, shown and hidden by JavaScript. A single video/canvas stage is moved between the relevant screens.

## How the data flows

Camera → MediaPipe hand landmarks → left/right hand assignment → pipeline → recent-frame buffer and camera overlay.

Keyboard → timestamped key event → pipeline → typing session and screen update → wait 120 ms → finger-attribution function → confidence check → feedback and session statistics.

The delay lets camera frames arrive after a key press. The frame buffer retains two seconds of history. Attribution receives the key event, frame buffer, and optional calibration, and should return a finger ID plus confidence, or null when unsure. Results below 0.5 confidence become “unavailable.”

Debug replay feeds recorded landmarks and keys through the same pipeline. It suppresses live input during replay and avoids adding replay sessions to practice history.

## File map

| File or folder | Responsibility |
| --- | --- |
| `index.html` | All five screens, camera stage, controls, result containers, and debug panel. |
| `css/styles.css` | Visual design, layout, typing states, dark mode, and responsive styling. Theme variables live near the top. |
| `fonts/` | Bundled Shantell Sans and Monaspace Radon fonts and licenses. |
| `js/main.js` | App coordinator: element references, state, screen navigation, event handlers, camera startup, exercises, delayed finger checks, and debugging. |
| `js/camera.js` | Camera permissions, device selection, opening/closing streams, and camera error handling. |
| `js/handTracker.js` | Loads MediaPipe, tries GPU then CPU, processes video frames, and tracks frame timing and speed. |
| `js/handSides.js` | Assigns detected hands to the user's left/right using image position and camera settings. |
| `js/landmarks.js` | Hand landmark indices, fingertip lookup, and skeleton connections. |
| `js/pipeline.js` | Shared entry point and listeners for live or replayed frames and keys. |
| `js/frameBuffer.js` | Keeps recent frames and retrieves frames in a time window. |
| `js/calibration.js` | Home-row measurements, saving/loading calibration, and guided keyboard-corner capture. |
| `js/keyboardGrid.js` | Keyboard layout and perspective mapping between camera coordinates and keyboard coordinates. |
| `js/core/fingerAttribution.js` | Intended decision about which finger actually pressed a key; currently unfinished. |
| `js/keyboard.js` | Captures relevant keyboard events, filters unwanted input, and prevents browser defaults where needed. |
| `js/fingerMap.js` | US QWERTY key-to-expected-finger rules and readable finger labels. Space accepts either thumb. |
| `js/exercises.js` | All lesson text and level definitions. |
| `js/session.js` | Typing progress, corrections, WPM, character accuracy, finger accuracy, and summary calculations. |
| `js/feedback.js` | Validates attribution output and turns it into correct/wrong/unavailable feedback. |
| `js/overlay.js` | Draws hand skeletons, finger flashes, and the optional keyboard grid over video. |
| `js/summaryView.js` | Renders summary scores, charts, substitutions, and history. |
| `js/storage.js` | Browser-local settings, calibration, exercise progress, and session history; handles unavailable storage. |
| `js/config.js` | Model URLs, confidence thresholds, timing, camera preferences, and other tuning values. |
| `js/debug/recorder.js` | Records landmark/key data and downloads it as JSON; does not record video. |
| `js/debug/replay.js` | Validates recording files and replays their timelines. |
| `js/debug/traces.js` | Finger-motion plots around individual keystrokes. |
| `scripts/serve.mjs` | Local static server. |
| `scripts/check-syntax.mjs` | JavaScript syntax checks. |
| `scripts/evaluate-recordings.mjs`, `scripts/lib/` | Scores attribution against labeled recordings and reports coverage/accuracy. |
| `scripts/make-fixture.mjs` | Converts labeled recordings into regression fixtures. |
| `tests/*.test.js`, `tests/synthetic.js` | General unit tests and generated hand-motion data. |
| `tests/core/` | Acceptance tests for the unfinished finger-attribution algorithm. |
| `tests/fixtures/recordings/` | Two recording fixtures, labels, and evaluation targets. Labels are marked as not human-verified. |
| `tests/e2e/smoke.spec.js`, `playwright.config.js` | Browser tests covering navigation, typing, results, replay, calibration, and deployment subpaths. |
| `package.json`, `package-lock.json` | Development commands and pinned test dependencies. |

## Current status and important distinctions

- The surrounding typing, tracking, calibration, feedback, and debugging code is implemented.
- `ATTRIBUTION_IMPLEMENTED` is false, and `attributeKeystroke()` always returns null. Actual finger-use detection is therefore not implemented in this copy. MediaPipe detecting hand positions does not by itself decide which finger pressed a key.
- Without attribution, typing practice can still produce WPM and character accuracy. The fallback finger histogram represents which fingers should have been used, not observed finger use.
- WPM uses correct characters currently on screen divided by five and elapsed minutes. Character accuracy includes all character attempts, including mistakes later corrected.
- All stored progress belongs to the current browser/site. There is no cross-device sync. Video is processed locally; MediaPipe library/model files load from external hosts.
- The README's statement that no keyboard calibration is needed is out of date relative to the optional keyboard-mapping step now present in the code.
- Some general and browser tests explicitly expect the attribution placeholder. Those expectations need updating when the real algorithm lands.

## Suggested division of work

For frontend work, begin with `index.html`, `css/styles.css`, `js/summaryView.js`, and the rendering/navigation portions of `js/main.js`. Lesson copy belongs in `js/exercises.js`; camera graphics belong in `js/overlay.js`.

Your friend can focus on `js/core/fingerAttribution.js`, tracking/calibration, and the evaluation tooling. Keep the attribution function's input/output contract stable so UI and algorithm work can proceed independently.

Preserve HTML IDs and screen/stage hooks when changing layouts, or update their references in `main.js` and browser tests together. Preserve keyboard focus and text feedback as well as visual feedback. A framework migration is not required to begin frontend work.

## Running and checking

From this project directory:

```sh
npm run serve
```

Open `http://localhost:8080`. The static server needs Node but no installed packages. Camera use requires localhost or HTTPS, and tracking needs access to the configured model hosts.

For browser test tooling, install the declared dependencies and Chromium first:

```sh
npm ci
npx playwright install chromium
npm run e2e
```

Checks performed during this inspection:

- Syntax: **45/45 files passed**.
- General unit tests: **190 passed, 0 failed**.
- Core attribution tests: **8 passed, 40 failed**, consistent with the unfinished algorithm.
- Browser tests and real-camera behavior: **not run during this inspection**.

`npm run check` runs syntax, general unit tests, and browser tests; it does not include `npm run test:core`. A passing general check is not proof that finger attribution works.

The archive was extracted into the Hightype workspace. Before this guide was added, its files matched the supplied Desktop folder. Application source was not modified.
