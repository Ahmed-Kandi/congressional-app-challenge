# Team Notes (study guide)

This guide is for the two of you. Judges may ask you to explain any line of code, so the goal is that you can explain every file in your own words. It assumes you know Java and Python and some JavaScript.

Read it in this order: the JavaScript primer, the data flow walkthrough, then the file-by-file notes, then "Your part: finger attribution".

---

## JavaScript primer (things that differ from Java and Python)

- **ES modules.** Each `.js` file is a module. `export function foo()` makes `foo` available; `import { foo } from "./other.js"` uses it. Like Python's `from other import foo`. The browser loads them directly because `index.html` uses `<script type="module">`.
- **`const` and `let`.** `const` cannot be reassigned (but an object it points to can still change); `let` can. There is no `var` in this project.
- **Arrow functions.** `(a, b) => a + b` is a short function, like a Python `lambda` but it can have a body in `{ }`.
- **Objects are like Python dicts.** `{ x: 1, y: 2 }`. `point.x` reads a field. `{ ...a, b: 3 }` copies `a` and sets `b` (like `{**a, "b": 3}` in Python).
- **Destructuring.** `const { side, index } = fingertipLocation(id)` pulls two fields out of the returned object.
- **`??` and `?.`.** `a ?? b` means "a, unless a is null or undefined, then b". `a?.b` means "a.b, or undefined if a is null" (no crash).
- **Template strings.** `` `Next: ${label}` `` is like a Python f-string.
- **`async` / `await`.** Some work (opening the camera, downloading the model) takes time. `await` pauses that function until it finishes, without freezing the page. Like Python's `asyncio`.
- **Events.** `element.addEventListener("click", fn)` calls `fn` when the element is clicked. The whole app is driven by events: key presses, camera frames, button clicks, timers.
- **Timers.** `setTimeout(fn, 120)` runs `fn` once after 120 ms. `setInterval(fn, 1000)` runs it every second.
- **`performance.now()`** returns milliseconds since the page loaded, with fractions of a millisecond. Camera frame times and key press times are both on this clock, which is what makes the whole idea work.

---

## Data flow walkthrough: from camera frame to summary screen

Follow one keystroke through the app.

1. **Camera opens.** `camera.js#openCamera` asks the browser for the camera (`getUserMedia`). `main.js` puts the video stream in the `<video>` element.

2. **A new camera frame arrives.** `handTracker.js` asked the browser to call `processFrame` on every new video frame (`requestVideoFrameCallback`). The browser also says *when the frame was captured* (`metadata.captureTime`). That time becomes the frame's `t`.

3. **MediaPipe finds hands.** `detectForVideo` returns up to two hands, each with 21 points (`x`, `y` between 0 and 1 across and down the image; `z` is depth relative to the wrist).

4. **Left or right?** `handSides.js#assignSides` labels each hand `"L"` or `"R"` from where it is in the image and the two camera settings. Now the frame is in the app's format:
   `{ t: 1234.5, hands: [ { side: "L", landmarks: [21 points], score: 0.97 }, { side: "R", ... } ] }`

5. **Into the pipeline.** `handTracker` calls `pipeline.ingestFrame(frame, "live")`. The pipeline pushes it into the **frame buffer** (last 2 seconds of frames) and tells every listener: the overlay draws the skeleton, the Setup screen updates the hand indicators, the recorder saves it if recording, calibration collects it if calibrating.

6. **A key is pressed.** `keyboard.js` hears `keydown`, ignores repeats and shortcuts, and calls `pipeline.ingestKey({ code: "KeyF", key: "f", t: event.timeStamp })`. `event.timeStamp` is on the same clock as the frames.

7. **The exercise updates.** `main.js#handleExerciseKey` gives the key to the `TypingSession` (`session.js`), which marks the character right or wrong and remembers the keystroke with its expected finger (`fingerMap.js#expectedFingers("KeyF")` gives `["L_INDEX"]`). The screen updates the highlighted text, "Next: ...", WPM and accuracy.

8. **Wait 120 ms.** The camera is slower than the keyboard: the frame showing the finger hitting the key reaches us *after* the key event. So `scheduleFingerCheck` waits `ATTRIBUTION_DELAY_MS` (120 ms, in `config.js`).

9. **Your function runs.** `feedback.js#runAttribution` calls **your** `attributeKeystroke(keyEvent, frameBuffer, calibration)`. It catches errors and rejects bad answers, so a bug in your code can never crash practice.

10. **Compare and show.** `feedback.js#evaluateAttribution` compares your answer with the expected finger: `"correct"`, `"wrong"`, or `"unavailable"` (null, or confidence below 0.5). `showFingerCheck` writes "Wrong finger: used right middle, should be left index." and flashes that fingertip on the overlay (`overlay.js#flash`). The result is stored on the keystroke with `session.recordFingerCheck`.

11. **Exercise ends.** When the last character is typed, `finishExercise` waits for the last finger check, asks the session for its `summary()`, saves a short history entry (`storage.js#addToHistory`), and opens the Summary screen.

12. **Summary.** `summaryView.js` draws WPM, accuracy, finger accuracy, the histogram, the "N fingers for 90 percent" headline, the top three wrong-finger mix-ups, and the last 10 sessions.

**Replay** uses the same steps 5 to 12. `replay.js` reads a recording and calls `pipeline.ingestFrame(..., "replay")` and `pipeline.ingestKey(..., "replay")` at the recorded times, so your function sees exactly what it would have seen live.

---

## File by file

Each entry: what it does, data in and out, the lines most worth understanding, and a question a judge might ask.

### `index.html`
**Does:** the page skeleton: header with the privacy line, five `<section class="screen">` elements (only one visible at a time), the camera stage (`<video>` plus a `<canvas>` on top), and the debug panel.
**In/out:** read by the browser; `main.js` finds elements by `id`.
**Key lines:**
- `<script type="module" src="js/main.js">`: loads the app as ES modules. No build step.
- `<link rel="stylesheet" href="css/styles.css">`: relative path (no leading `/`), so it works at `/repo-name/` on GitHub Pages.
- `<p class="feedback" id="feedback-text" aria-live="polite">`: screen readers announce feedback changes.
**Judge question:** *Why is everything in one HTML file instead of separate pages?* Switching screens only hides and shows sections, so the camera and hand tracker keep running without restarting, and there is no server needed.

### `css/styles.css`
**Does:** layout, colors, focus outlines, dark mode, reduced motion.
**Key lines:**
- `:root { --bg: ...; --text: ...; }` and `@media (prefers-color-scheme: dark) { :root { ... } }`: colors are variables; dark mode just changes the variables.
- `[hidden] { display: none !important; }`: makes the `hidden` attribute always win. Without it a badge with `display: inline-block` stayed visible (a bug a test caught).
- `@media (prefers-reduced-motion: reduce)`: turns off animations for students who set that in their OS.
**Judge question:** *How does your app work for a student who is color blind?* Every color signal also has words or a symbol: wrong characters get a wavy underline, flashes draw a check or cross, indicators show a check or cross, and the feedback sentence says "Correct finger" or "Wrong finger".

### `js/main.js`
**Does:** starts the app and connects all modules. Holds the screen state machine (`showScreen`), the Setup screen logic, the exercise loop, scheduling the finger check, and the debug panel buttons.
**In/out:** in: DOM events, frames and keys from the pipeline. Out: updates to the page.
**Key lines:**
- `pipeline.onKey((keyEvent) => { if (state.screen === "exercise" && state.exerciseActive) handleExerciseKey(keyEvent); ... })`: every key goes through the pipeline first, then to the exercise.
- `setTimeout(() => { runFingerCheck(...) }, ATTRIBUTION_DELAY_MS)`: the delayed call to your function.
- `if (frame.t - state.bothHandsSince >= SETUP_BOTH_HANDS_REQUIRED_MS) ui.setupContinue.disabled = false;`: Continue unlocks after one second of both hands.
**Judge question:** *What's the `?skipSetup=1` flag?* A testing-only shortcut that jumps straight into an exercise without a camera, so the automated browser test can type without real hands.

### `js/config.js`
**Does:** every tunable number, each with a comment saying why.
**Key lines:**
- `export const ATTRIBUTION_DELAY_MS = 120;`: how long to wait for late camera frames.
- `export const MIN_ATTRIBUTION_CONFIDENCE = 0.5;`: below this, the app says "unavailable" instead of "wrong".
- `export const MEDIAPIPE_VERSION = "1.1.1";`: pinned so a new release can't change behavior before the deadline.
**Judge question:** *Why 120 ms?* Camera frames reach the page tens of milliseconds after the moment they show (the debug panel measured about 95 ms with a test camera). Waiting a bit longer means the frames showing the finger landing are already in the buffer. You can tune it with your own recordings.

### `js/landmarks.js`
**Does:** names for MediaPipe's 21 landmark numbers (wrist 0, thumb tip 4, index tip 8, middle tip 12, ring tip 16, pinky tip 20), the skeleton connections, and `fingertipLocation("L_INDEX")` which returns `{ side: "L", index: 8 }`.
**Key lines:**
- `export const INDEX_TIP = 8;`: no other file writes a bare `8`.
- `export function fingertipLocation(fingerId)`: splits `"L_INDEX"` into the hand and the landmark number.
**Judge question:** *Why not just use the numbers?* Named constants make code readable and a typo would only need fixing in one place.

### `js/camera.js`
**Does:** opens the camera, lists cameras for the picker, remembers the chosen one, and turns browser errors into simple kinds (`denied`, `notFound`, `inUse`, `insecure`).
**Key lines:**
- `if (!cameraAllowedHere()) throw new CameraError("insecure", ...)`: browsers only allow cameras on https or localhost.
- `video.deviceId = { exact: deviceId }`: opens one specific camera (like the iPhone).
- `case "NotAllowedError": return new CameraError("denied", ...)`: permission denied becomes a friendly message in `main.js`.
**Judge question:** *Does the app send video anywhere?* No. The stream goes into a `<video>` element and MediaPipe in the same page. There is no upload code; the only network requests load MediaPipe and the model.

### `js/handTracker.js`
**Does:** downloads MediaPipe, creates the HandLandmarker (GPU first, CPU if that fails), and runs it on every new video frame. Produces frames in the app format and keeps fps and lag statistics.
**In/out:** in: the `<video>`. Out: `onFrame(frame)` for each processed frame.
**Key lines:**
- `this.video.requestVideoFrameCallback((now, metadata) => this.processFrame(now, metadata))`: run once per new camera frame.
- `chooseFrameTime`: prefer `metadata.captureTime`, then `expectedDisplayTime`, then `now`. All are on the `performance.now()` clock.
- `const mediapipeTime = Math.max(this.lastMediapipeTime + 1, Math.round(t));`: MediaPipe requires strictly increasing timestamps; the app's own `t` stays exact.
**Judge question:** *Why does the timestamp matter so much?* The whole method lines up key events and video frames in time. If frames were stamped when we processed them instead of when they were captured, every frame would look ~100 ms later than reality and the wrong moment would be examined.

### `js/frameBuffer.js`
**Does:** keeps frames from the last 2 seconds, in time order. `push`, `between(t0, t1)`, `latest()`, `clear()`.
**Key lines:**
- `while (insertAt > 0 && this.frames[insertAt - 1].t > frame.t) insertAt -= 1;`: keeps order even if a frame arrives late.
- `const cutoff = newest.t - this.windowMs;`: anything older is removed on each push.
- `return this.frames.filter((frame) => frame.t >= t0 && frame.t <= t1);`: both ends included.
**Judge question:** *Why not keep every frame?* At 30 to 60 fps that grows forever. Two seconds is far more than a keystroke needs, and memory stays small.

### `js/handSides.js`
**Does:** labels each detected hand `"L"` or `"R"` using its position in the image plus the settings `mirrored` and `cameraFacing`.
**Key lines:**
- `const seesLikeUser = cameraFacing !== "behind"; return mirrored ? !seesLikeUser : seesLikeUser;`: the whole orientation rule in two lines.
- Two hands: the one further toward the user's-left side of the image is `"L"`.
- One hand: decided by which half of the image it is in.
**Judge question:** *MediaPipe already says Left or Right. Why not use that?* MediaPipe is trained on selfie-style pictures. From above a keyboard, or with a mirrored image, its label is often backwards. Position plus a setting the student can check (the L/R labels on screen) is more reliable.

### `js/pipeline.js`
**Does:** the single path for frames and keys. Live input and replays both go through `ingestFrame` and `ingestKey`, so they run the same code. While replaying, live input is ignored.
**Key lines:**
- `if (from !== source) return;`: only the current source gets through.
- `frameBuffer.push(frame);`: every frame lands in the buffer before listeners run.
- `setSource(newSource)` clears the buffer so live and replayed frames never mix.
**Judge question:** *How do you know replay tests the real code?* Replay doesn't have its own copy of the logic; it calls the exact same pipeline functions as the camera and keyboard.

### `js/keyboard.js`
**Does:** listens for `keydown` on the whole page and emits `{ code, key, t }`.
**Key lines:**
- `if (event.repeat) return true;`: holding a key down isn't a new press.
- `onKey({ code: event.code, key: event.key, t: event.timeStamp });`: `code` is the physical key ("KeyF"), `key` is the character ("f" or "F"), `timeStamp` is on the frame clock.
- `if (isExerciseActive() && PREVENT_DEFAULT_CODES.has(event.code)) event.preventDefault();`: stops Space from scrolling, Backspace from going back, `'` and `/` from opening quick find.
**Judge question:** *Why `event.code` and not `event.key`?* `code` names the physical key, which is what a finger touches. `key` changes with Shift and keyboard layout ("f" vs "F").

### `js/fingerMap.js`
**Does:** the table of which finger should press each key (the standard touch-typing chart), plus helpers to find the key for a character and to describe fingers in words.
**Key lines:**
- `FINGERS_BY_CODE.set("Space", ["L_THUMB", "R_THUMB"]);`: either thumb is correct for Space.
- `export function expectedFingers(code) { return [...(FINGERS_BY_CODE.get(code) ?? [])]; }`: returns a copy; unknown keys give `[]`.
- `Digit6` is in the `R_INDEX` list (charts disagree; we chose right index).
**Judge question:** *What finger should press 6?* Charts disagree; we follow the more common modern chart that gives it to the right index, and it's one line to change.

### `js/calibration.js`
**Does:** the Calibrate screen. The student rests on the home row and presses Space; after a 0.5 s settle the app collects 3 seconds of frames, checks both hands were visible in at least 80 percent, and averages each fingertip and wrist. Saves `{ createdAt, baselines, wristBaselines, handSpan }`.
**Key lines:**
- `const bothHandsRatio = ... bothHandFrames.length / frames.length;` and the check against `CALIBRATION_MIN_BOTH_HANDS_RATIO`.
- `baselines[finger] = averagePoint(...)`: resting position of each fingertip.
- `handSpan`: average distance from index tip to pinky tip, a yardstick for how big a hand looks in this camera.
**Judge question:** *What is calibration used for?* It records where each finger rests and how big hands look from this camera angle. Your attribution can use it, for example to scale movement to hand size. It never decides fingers itself.

### `js/exercises.js`
**Does:** all exercise text (original): 8 home row drills, 8 lines of home row words, 10 sentences.
**Key lines:**
- `HOME_ROW_CHARACTERS = new Set("asdfghjkl; ")`: a test checks Levels 1 and 2 use only these.
- `getExerciseText(levelId, index)`: wraps around after the last exercise.
**Judge question:** *Why start with "fff jjj"?* F and J have bumps; touch typists find home position by feel. Anchoring on them first builds the habit of returning to home row.

### `js/session.js`
**Does:** one typing session: what was typed, WPM, accuracy, and the summary statistics.
**Key lines:**
- `return correctChars / CHARS_PER_WORD / (elapsedMs / 60000);`: WPM, where a "word" is 5 characters.
- Accuracy counts every character keystroke, so a mistake fixed with Backspace still counts.
- `fingersCoveringShare`: sort the per-finger counts from biggest, add them up until reaching 90 percent, and count how many fingers that took.
**Judge question:** *How do you compute WPM?* Correct characters on screen divided by 5, divided by minutes from first to last keystroke. For example 50 correct characters in 60 seconds is 10 WPM. Tests check examples worked by hand.

### `js/overlay.js`
**Does:** draws the hand skeleton on the `<canvas>` over the video, the L/R labels, and the 400 ms green/red fingertip flash with a check or cross.
**Key lines:**
- `return { x: point.x * this.canvas.width, y: point.y * this.canvas.height };`: MediaPipe's 0-to-1 coordinates become pixels.
- `const until = prefersReducedMotion() ? Infinity : performance.now() + FLASH_DURATION_MS;`: reduced motion gets a steady highlight instead of a flash.
- `ctx.fillText(flash.correct ? "✓" : "✗", ...)`: a check or cross so the flash doesn't rely on color.
**Judge question:** *Why is the canvas the same size as the video?* Then a landmark at x = 0.5 is drawn exactly over the middle of the video, with no extra math.

### `js/feedback.js`
**Does:** wraps your function. `runAttribution` calls it safely and rejects bad answers; `evaluateAttribution` compares your answer with the expected fingers; `feedbackMessage` writes the sentence; `showFingerCheck` updates the text and the overlay.
**Key lines:**
- `try { result = attributeKeystroke(...) } catch (error) { return { result: null, problem: ... } }`: your bug can't break practice.
- `if (!result || ... || result.confidence < MIN_ATTRIBUTION_CONFIDENCE) return { status: "unavailable", ... }`
- `const status = expected.includes(result.finger) ? "correct" : "wrong";`: the only comparison in the app.
**Judge question:** *What happens when the camera can't tell?* Your function returns null (or low confidence) and the student sees "Finger check unavailable." WPM and accuracy still count. We would rather say nothing than wrongly tell a student they used the wrong finger.

### `js/storage.js`
**Does:** saves settings, the camera choice, calibration, exercise progress and the last 10 sessions in `localStorage`, with every access in `try/catch`.
**Key lines:**
- `function defaultBackend() { try { return globalThis.localStorage ?? null; } catch { return null; } }`: even reading `localStorage` can throw on locked-down browsers.
- `const history = [summary, ...loadHistory()].slice(0, HISTORY_LIMIT);`
- `createStorage(backend)`: tests pass a fake backend.
**Judge question:** *What if the school blocks storage?* The app keeps working; it just forgets settings between visits. A test uses a storage that throws on every call.

### `js/summaryView.js`
**Does:** draws the Summary screen and history table with plain HTML.
**Key lines:**
- ``fill.style.height = `${(bar.count / max) * 100}%`;``: each bar's height is its share of the biggest bar.
- `container.setAttribute("aria-label", "Keystrokes per finger: ...")`: screen readers hear the numbers.
- `headlineText`: the "You used N fingers for 90 percent" sentence, only when the finger check ran.
**Judge question:** *Why no chart library?* We kept the app free of extra libraries, and a bar chart is just boxes with heights. Fewer dependencies, faster on Chromebooks.

### `js/debug/recorder.js`
**Does:** records live frames and key presses, then downloads them as a JSON file.
**Key lines:**
- `buildRecording` creates `{ format, version, meta, frames, keyEvents }`.
- `if (this.frames.length >= RECORDING_MAX_FRAMES) this.recording = false;`: a safety cap.
- `downloadRecording` makes a file in the browser and downloads it; nothing is uploaded.
**Judge question:** *Do recordings contain video?* No, only landmark coordinates and key presses, which is much smaller and more private.

### `js/debug/replay.js`
**Does:** loads a recording, checks it is valid, shifts its timestamps onto today's clock, and plays it through the pipeline in real time.
**Key lines:**
- `parseRecording` throws a readable error for wrong files.
- `const shift = newStart - firstTime;`: moves the clock but keeps every gap between events identical.
- `pipeline.ingestFrame(event.data, "replay")`: same path as live.
**Judge question:** *Why replay in real time instead of instantly?* The app waits 120 ms before checking a keystroke. Replaying in real time keeps that timing identical to a live session.

### `js/debug/traces.js`
**Does:** for each keystroke, saves the frames from 300 ms before to 300 ms after, and plots each fingertip's x, y and z over that window. The dashed vertical line is the key event. The thick line is the finger that *should* press that key (from the finger map).
**Key lines:**
- `frameBuffer.between(keyEvent.t - TRACE_WINDOW_BEFORE_MS, keyEvent.t + TRACE_WINDOW_AFTER_MS)`
- `value: relative ? raw - first : raw`: "change from start of window" mode, so small motions are visible.
- `if (!point) { penDown = false; continue; }`: a gap where the hand wasn't seen.
**Judge question:** *How did you figure out which signal to use?* (Answer with what you actually find; see the next section.)

### `js/core/fingerAttribution.js`
**Does:** right now, nothing: `attributeKeystroke` returns `null` and `ATTRIBUTION_IMPLEMENTED` is `false`. This is your file. See the next section.

### `tests/synthetic.js`
**Does:** makes fake frames that look like MediaPipe output: two hands resting on the home row, gaussian noise on every coordinate, and a press where a chosen fingertip moves toward the keyboard over 80 ms and back over 120 ms. Options for fps, noise, frame lag, missing hands, and a second finger moving at the same time.
**Key lines:**
- `pressDepth(now, keyTime, downMs, upMs)`: 0 at rest, 1 at the bottom of the press, smooth in between.
- `const shownTime = t - opts.frameLagMs;`: a lagging frame shows the past.
- The generator moves the finger it was *told* to move; it never works out a finger from data.
**Judge question:** *Isn't testing on fake data cheating?* It's for repeatable tests where we know the right answer. Real recordings (debug panel) are how we check the real camera. The synthetic press direction is a guess about one camera angle.

### `tests/*.test.js`
Unit tests run with Node's built-in runner: `node --test`. Each file tests one module. `npm test` must pass. Worth reading first: `session.test.js` (hand-worked WPM math) and `handSides.test.js` (every camera setting combination).

### `tests/core/fingerAttribution.test.js`
Tests for your function. They fail now on purpose. See below.

### `tests/e2e/smoke.spec.js`
Browser tests with Playwright. Chromium starts with a fake camera (a green test pattern, no hands). Checks: no console errors, camera picker filled, privacy line, debug panel toggle, typing updates the display, the badge shows, a full drill reaches the summary, replay works, and (with a fixed fake answer that ignores the frames) the right/wrong display works.

### `scripts/serve.mjs`, `scripts/check-syntax.mjs`, `playwright.config.js`, `package.json`
Tooling. `serve.mjs` is a 60-line web server with caching disabled. `check-syntax.mjs` runs `node --check` on every file. `playwright.config.js` starts the server and the fake camera for the browser tests. `package.json` defines the `npm run ...` commands.

---

## Your part: finger attribution

This is the heart of the project, and the part the competition expects you to have built. Everything else exists to make this function possible to write, test and demonstrate.

### The idea (in words)

Don't try to find the keys in the picture. The browser already tells you *which* key was pressed and *exactly when*. So when a key fires, look at the few camera frames around that moment, work out which finger moved toward the keyboard, and report it. The app then compares your answer with the finger that should have pressed that key. How you define "moved toward the keyboard", which frames you look at, and how sure you are, is up to you.

### The interface

```js
export const ATTRIBUTION_IMPLEMENTED = false;   // set to true when yours works
export function attributeKeystroke(keyEvent, frames, calibration) { ... }
```

- **`keyEvent`**: `{ code: "KeyF", key: "f", t: 1234.56 }`. `t` is in milliseconds on the `performance.now()` clock, the same clock as frame times.
- **`frames`**: the `FrameBuffer`. Call `frames.between(t0, t1)` to get frames with `t0 <= t <= t1`, oldest first. When your function is called, the buffer holds frames up to about `keyEvent.t + 120` ms (`ATTRIBUTION_DELAY_MS`) and back about 2 seconds.
- **`calibration`**: `null` if the student skipped calibration, otherwise `{ createdAt, baselines: { L_INDEX: {x,y,z}, ... all 10 }, wristBaselines: { L: {x,y,z}, R: {x,y,z} }, handSpan }`.
- **Return**: `{ finger: "L_INDEX", confidence: 0.8 }` (optional `debug` object for your own notes), or `null` if unsure. `finger` must be one of the ten IDs in `fingerMap.js#FINGERS`; `confidence` must be between 0 and 1. Answers below 0.5 confidence show as "unavailable".
- Don't change the frames you are given (a test checks).

### The frame format

```js
{ t: 1234.5,
  hands: [ { side: "L", landmarks: [ {x, y, z}, ... 21 points ], score: 0.97 },
           { side: "R", landmarks: [ ... ], score: 0.95 } ] }
```

- A hand can be missing in some frames (`hands` can have 0, 1 or 2 entries). Find a hand by `side`, not by position in the array.
- `x` runs 0 (left edge of the image) to 1 (right edge); `y` runs 0 (top) to 1 (bottom); `z` is depth relative to the wrist, more negative meaning closer to the camera. `x` and `y` are fractions of the image width and height, so they aren't the same physical size unless the image is square.
- Fingertips are landmarks 4, 8, 12, 16, 20 (`landmarks.js`; use the names, not the numbers). `fingertipLocation("R_RING")` gives `{ side: "R", index: 16 }`.

### What the tests expect (`npm run test:core`)

They build synthetic frames where the answer is known, fill a `FrameBuffer` only up to `keyEvent.t + 120` ms (like the real app), and check:

1. `ATTRIBUTION_IMPLEMENTED` is `true`.
2. A clean press of each of the 8 non-thumb fingers returns that finger, at 30 fps and at 60 fps.
3. The same with the video 50 ms behind the key events.
4. It works when `calibration` is `null`.
5. When a second finger moves at the same time but less (40 percent), the finger that moved more wins.
6. With no hands, with the pressing hand missing, or with an empty buffer, it returns `null` or confidence below 0.5.
7. It never returns an unknown finger ID or a confidence outside 0 to 1.
8. It doesn't modify the frames.

Today 30 of 35 fail with messages like `Clean L_INDEX press at 30 fps: expected L_INDEX (left index), got null`. The 5 that pass do so only because `null` is an allowed answer for them.

**Warning:** the synthetic press moves fingertips in one made-up direction (mostly +y and +z). Passing the synthetic tests does not prove your method works on a real camera. Real recordings are the real test.

### Using the debug tools to find your signal

1. Set up the camera the way you will demo it. Calibrate.
2. Open **Debug** (bottom-left). Press **Record**. Type a Level 1 drill normally for about 30 seconds. Press **Stop and download JSON**.
3. Look at **Motion traces**. Each plot shows one axis (x, y, z) for all ten fingertips, from 300 ms before to 300 ms after the selected keystroke. The dashed line is the moment the key fired. The thick line is the finger that *should* have pressed it. Right-hand lines are dashed.
4. Use the **Keystroke** list to step through the last 50 keystrokes. For each, ask: does the finger that pressed show a clear bump in x, y or z near the dashed line? Which axis is clearest *with your camera angle*? How far before or after the key line does the bump peak (that's your lag)? How big is the bump compared with the wiggle of fingers that didn't press?
5. Try "Show change from start of window" on and off.
6. Load your recording with **Load recording for replay**. It replays through the real pipeline, so you can change your code, reload the page, and replay the same typing to compare.
7. Record tricky cases on purpose: fast typing, a wrong finger on purpose, one hand partly out of view, Space with each thumb.

### Suggested steps

1. Do the feasibility check first (first item in HUMAN_CHECKLIST.md). If no axis shows a visible bump, change the camera angle before writing any code.
2. Write down, in your own words, your rule for "this finger moved toward the keyboard" and which frames you look at. Decide what you will do when a hand is missing.
3. Decide how you'll turn your measurement into a confidence between 0 and 1, and when you'll return `null` instead.
4. Implement it in `js/core/fingerAttribution.js`. Keep helper functions in that same file (or in `js/core/`) so it's clear what is yours.
5. Run `npm run test:core` until it passes, then `npm test` to make sure nothing else broke.
6. Test on real recordings with replay, and live. Tune `ATTRIBUTION_DELAY_MS` in `config.js` if your bump peaks later than 120 ms.
7. Set `ATTRIBUTION_IMPLEMENTED = true`. The "Finger check not built yet" badge disappears.
8. `tests/feedback.test.js` has one check that the stub returns null; it skips itself once `ATTRIBUTION_IMPLEMENTED` is true, so no change is needed there.
9. Practise explaining it: what signal, which window, why that confidence, what happens in the hard cases.

### Questions a judge may ask about your part

Prepare your own answers; they should describe what you built.
- Which signal did you use (x, y or z motion), and why that one for your camera angle?
- How do you handle the camera being slower than the keyboard?
- What happens when two fingers move at once?
- What happens when a hand leaves the picture?
- How accurate is it? How did you measure that?
