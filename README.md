# Typing Form Coach

A browser app that watches your real hands through a camera while you type and tells you, live, when you pressed a key with the wrong finger.

Built for the 2026 Congressional App Challenge (California's 39th district) by a team of two high school students.

## What it is

Typing tutors can't see your hands. They show an animated hand and trust you to copy it, so a student who types with two index fingers can still "pass" every lesson.

Typing Form Coach uses the camera to follow the student's actual fingers. When a key is pressed, the browser already knows which key and exactly when. The app looks back through the last few camera frames to see which finger moved toward the keyboard, and compares it with the finger that should press that key. It combines two data streams (keystrokes and video) and needs no keyboard calibration: it never has to find where the keys are in the picture.

The app has five screens:

1. **Setup:** pick a camera, set how it is mounted, and check that both hands are visible.
2. **Calibrate:** rest your fingers on the home row for 3 seconds.
3. **Choose:** Level 1 home row drills, Level 2 home row words, Level 3 full sentences.
4. **Exercise:** type the text. The fingertip flashes green or red, a sentence says "Wrong finger: used right middle, should be left index", and WPM and accuracy update live.
5. **Summary:** WPM, accuracy, finger accuracy, a chart of keystrokes per finger, "You used N fingers for 90 percent of your keystrokes", your most common wrong-finger habits, and your last 10 sessions.

A **Debug** button (bottom-left corner) opens tools for the team: fps, timestamps, recording and replaying sessions, and motion plots of every fingertip around each keystroke.

## The problem

Many students grow up typing on phones and reach high school still typing with one or two fingers ("hunt and peck"). Then state tests, essays, college applications and job applications all happen on a keyboard. Slow typing is a quiet part of the digital divide: it costs time on every timed writing test.

The app runs in a web browser so it works on school Chromebooks, with no install and no account.

## Run it locally

You need [Node.js](https://nodejs.org) 20 or newer (only for the local server and the tests; the app itself is plain HTML, CSS and JavaScript).

```bash
npm install
```

```bash
npm run serve
```

Then open http://localhost:8080 in Chrome. The camera only works on `localhost` or an `https://` address, so opening `index.html` directly as a file will show an error message instead.

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Unit tests (must pass). |
| `npm run test:core` | Tests for the team's finger attribution function. These fail until it is written. |
| `npm run e2e` | Browser smoke test in Chromium with a fake camera. Run `npx playwright install chromium` once first. |
| `npm run check` | Syntax check of every .js file, then `npm test`, then `npm run e2e`. |

## Use an iPhone as the camera (Continuity Camera)

A Mac can use an iPhone as a webcam, and browsers see it like any other camera.

1. You need an iPhone XR or newer on iOS 16 or later, a Mac on macOS 13 Ventura or later, both signed in to the same Apple Account, with Wi-Fi and Bluetooth turned on.
2. Mount the iPhone (a phone clamp or a stack of books works), screen locked, rear cameras pointing at your hands.
3. Open the app in Chrome on the Mac and allow camera access.
4. In the **Camera** list on the Setup screen, pick the iPhone (it is usually named like "Your Name's iPhone Camera"). The app remembers your choice next time.

Any other webcam works the same way: pick it from the list.

## Camera placement

- **Best:** above the keyboard looking down at your hands, high enough that both hands and the whole keyboard fit in the picture. Choose "Above the keyboard, looking down at my hands".
- **Also works:** on the far side of the keyboard, tilted down toward your hands. Choose "Behind the keyboard, looking at me".
- Check the big **L** and **R** labels on your wrists in the video. If they are on the wrong hands, tick "Image is mirrored". (This also fixes a camera that is upside down.)
- Use even lighting. Avoid a bright window behind your hands.
- The Continue button unlocks when both hands have been visible for one second.

## Deploy to GitHub Pages

1. Create a GitHub repository and push this folder to it (the team does this; nothing has been pushed yet).
2. On GitHub, open **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. After a minute the app is live at `https://<your-username>.github.io/<repo-name>/`.

There is no build step. Every path in the app is relative, so it works under the `/<repo-name>/` subpath (an automated test checks this). GitHub Pages uses `https://`, so the camera is allowed.

## Privacy

- **Video stays on this device. Nothing is uploaded.** Hand tracking runs inside the browser.
- The only network requests are downloading the MediaPipe hand tracking library (from cdn.jsdelivr.net) and its hand model (from storage.googleapis.com) when the page loads.
- No accounts, no analytics, no backend, no AI services.
- Settings, calibration and your last 10 session scores are saved in your own browser's `localStorage`. Clearing site data removes them.
- Debug recordings contain hand landmark positions and key presses (not video). They are only saved if you press Record and are downloaded to your own computer.
