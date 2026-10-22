# Human Checklist

Everything below needs a real camera and real hands, so it has not been tested with real hardware yet. The automated tests only used Chromium's fake camera (a green test pattern with no hands) and synthetic data.

Work through this in order with the iPhone, the Mac, and if possible a school Chromebook. Tick each box and write what actually happened next to anything that doesn't match.

Setup for every check: `npm run serve`, open http://localhost:8080 in Chrome.

## 0. Feasibility check (do this first)

This decides whether the core idea works with your camera angle, before any attribution code exists.

- [ ] Mount the iPhone above the keyboard, pick it in the Camera list, get both hands visible, Continue, Calibrate.
- [ ] Open **Debug**, press **Record**, start a Level 1 drill and type normally for about 30 seconds, then **Stop and download JSON**. Expected: a `typing-recording-....json` file downloads; the status says how many frames and key presses were saved (roughly 30 fps x 30 s = 900+ frames).
- [ ] In **Motion traces**, step through at least 20 keystrokes with the Keystroke list. Expected: for most keystrokes the finger that pressed shows a visible bump in at least one axis (x, y or z) close to the dashed key line, clearly bigger than the other fingers' wiggle.
- [ ] Write down: which axis shows it best, roughly how many ms after the dashed line the bump peaks, and how big it is.
- [ ] If no axis shows a clear bump, try the camera higher, lower, or more from the front, and repeat. Don't start writing attribution until one setup shows the bump.

## 1. Camera and setup screen

- [ ] On first load Chrome asks for camera permission. Expected: after Allow, the Camera list fills with real camera names.
- [ ] The iPhone appears in the Camera list (named like "...'s iPhone Camera") via Continuity Camera. Picking it switches the video to the iPhone.
- [ ] With the page already open, wake the iPhone near the Mac. Expected: it appears in the list within a few seconds without reloading (or after pressing Refresh list).
- [ ] Reload the page. Expected: the iPhone is still selected (remembered).
- [ ] Unplug or move away the iPhone and reload. Expected: the app falls back to the Mac's built-in camera instead of showing an error.
- [ ] With the iPhone above the keyboard, both hand indicators turn to a check ("Left hand visible", "Right hand visible") within 2 seconds of putting both hands on the keyboard.
- [ ] The **L** and **R** labels on the wrists are on the correct hands with "Above the keyboard, looking down" and "Image is mirrored" unticked. If not, ticking "Image is mirrored" fixes them immediately.
- [ ] Try "Behind the keyboard, looking at me" with a camera on the far side of the keyboard. Expected: labels correct (tick mirrored if not).
- [ ] Put only one hand in view. Expected: the tip says only one hand is visible; Continue stays disabled.
- [ ] Both hands visible for 1 second. Expected: Continue enables.
- [ ] Detection fps on the Setup screen is at least 25 on a MacBook.
- [ ] The debug panel shows "Frame timestamp source: captureTime" (if it shows expectedDisplayTime or callback now, write it down; timing will be less exact).
- [ ] "Estimated frame lag" in the debug panel. Write down the value; compare with `ATTRIBUTION_DELAY_MS` (120).
- [ ] The skeleton overlay lines up with the real hands in the video (not shifted or stretched).

## 2. Error messages

- [ ] Block the camera (click the camera icon in the address bar > Block, reload). Expected: a red message explaining how to allow the camera; no blank screen.
- [ ] Open the page from your Mac's network address (http://192.168.x.x:8080) on another computer. Expected: message saying the camera needs https or localhost. (The server only listens on localhost by default, so this may need a different setup; skip if awkward.)
- [ ] Turn off Wi-Fi before loading the page (MediaPipe can't download). Expected: message that the hand tracking model failed to load; "Practice without the camera" still works.
- [ ] Open the camera in another app first (for example Photo Booth), then load the page. Expected: a "camera is busy" message, or the camera works if macOS allows sharing.
- [ ] On a slow computer, or with many tabs running video, fps drops below 15. Expected: a yellow warning that tracking may be unreliable.
- [ ] In Chrome, go to `chrome://settings/system`, turn off "Use graphics acceleration", restart and reload. Expected: a note that hand tracking runs on the CPU; tracking still works but slower. "Model runs on" in debug says CPU.

## 3. Calibration

- [ ] Rest fingers on the home row, press Space with a thumb. Expected: countdown 3, 2, 1 with a progress bar, then "Calibration saved." and the Choose screen.
- [ ] Do it again with one hand out of view. Expected: a message saying both hands were visible in only N% of frames, and a chance to retry.
- [ ] Reload the page and go to Calibrate. Expected: "A saved calibration exists".

## 4. Typing with the camera

- [ ] Typing at normal speed does not freeze the overlay or make the text lag behind your typing.
- [ ] Space, Tab, Backspace, `'` and `/` don't scroll the page, move focus, go back, or open Firefox quick find during an exercise.
- [ ] The "Finger check not built yet" badge shows and each keystroke says "Finger check unavailable." (until your function exists).
- [ ] Capital letters in Level 3 show "+ right/left pinky on Shift" in the Next line.
- [ ] Esc leaves the exercise.
- [ ] After a full exercise, the Summary shows WPM, accuracy, "not available" finger accuracy, a histogram, and the session in the history.

## 5. After the team implements attribution

- [ ] A correct finger flashes the fingertip green with a check for about 0.4 s and says "Correct finger: ...".
- [ ] Deliberately press F with the right middle finger. Expected: red flash with a cross on the finger you used, and "Wrong finger: used right middle, should be left index."
- [ ] Turn on macOS "Reduce motion" (System Settings > Accessibility > Display). Expected: highlights stay steady instead of flashing.
- [ ] Hunt-and-peck a drill with two index fingers on purpose. Expected: the summary headline says "You used 2 fingers for 90 percent of your keystrokes" and the wrong-finger table lists the mix-ups.
- [ ] Type a drill with correct form. Expected: finger accuracy near 100 percent. Write down the real accuracy you measure; judges will ask.
- [ ] Space with left thumb and with right thumb both count as correct.
- [ ] Replay a recording made before your change. Expected: it types the same text and your function gives the same answers each time you replay it.

## 6. Chromebook

- [ ] Open the GitHub Pages URL on a school Chromebook. Expected: page loads, camera works (built-in webcam), fps shown. Write down the fps.
- [ ] If fps is below 15, note it; the app should show the slow tracking warning.
- [ ] School policy may block camera access or `localStorage`. Note what happens; the app should still allow practice without the camera.

## 7. GitHub Pages

- [ ] Push to GitHub, enable Pages (README "Deploy to GitHub Pages"). Open `https://<user>.github.io/<repo>/`. Expected: identical to localhost, no 404s in the browser console (View > Developer > JavaScript Console).
- [ ] Camera permission works on the https site.

## 8. Accessibility (quick manual pass)

- [ ] Using only Tab, Shift+Tab, Enter and Space, you can reach and use every button and control on Setup, Calibrate, Choose and Summary, with a visible orange focus outline.
- [ ] Switch macOS to Dark appearance. Expected: the app turns dark and everything stays readable.
- [ ] With VoiceOver on (Cmd+F5), feedback sentences are announced during an exercise.
