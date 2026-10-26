# Hightype

A browser app that watches your real hands through a camera while you type and tells you, live, when you pressed a key with the wrong finger.

Built for the 2026 Congressional App Challenge (California's 39th district) by a team of two high school students.

## What it is

Typing tutors can't see your hands. They show an animated hand and trust you to copy it, so a student who types with two index fingers can still "pass" every lesson.

Hightype uses the camera to follow the student's actual fingers. When a key is pressed, the browser knows which key and when. The app checks fingertip motion around that moment, uses the mapped keyboard position as supporting evidence, and compares the result with the expected finger. It leaves the finger check unavailable when the camera evidence is unclear.

The main flow is:

1. **Landing and dashboard:** see the introduction, start camera setup, or choose lessons.
2. **Camera setup:** select a camera, confirm the keyboard view and camera angle, then check that both hands and their labels are correct.
3. **Calibration:** rest your fingers on the home row for 3 seconds, then drag four discs onto the Q, P, Z and / keys in the camera view.
4. **Practice:** take the passage typing test or choose a lesson. The camera view labels visible fingers and their estimated keys. During lessons, confident finger checks give written feedback and colored flashes.
5. **Results:** review speed, character and finger accuracy, per-finger counts, common substitutions and recent sessions.

The **Debug** button opens recording, replay and motion-trace tools. Its labeled data collection run asks for specific key and finger presses, then downloads a recording with the labels embedded for evaluation.

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
| `npm run test:core` | Synthetic finger attribution tests and camera recording evaluation. The bundled recordings with unverified labels are skipped. |
| `npm run e2e` | Browser smoke test in Chromium with a fake camera. Run `npx playwright install chromium` once first. |
| `npm run check` | Syntax check of every .js file, then `npm test`, then `npm run e2e`. |
| `npm run evaluate -- recordings/` | Score the finger check on labeled recordings (format in `scripts/lib/labels.mjs`). `--list <file>` numbers the keys for labeling. |
| `npm run fixture -- <recording> <name>` | Turn a labeled recording into a regression test in `tests/fixtures/recordings/`. |

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
- Check the **L** and **R** labels on your wrists in the video. If they are on the wrong hands, adjust the mirrored-image setting. Use **Rotate view 180°** when the camera image is upside down.
- **Show my hands facing me** turns the displayed picture around for a more natural view; finger checks use the original camera data.
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
- Settings and your last 10 session scores are saved in your browser's `localStorage`. Camera and keyboard calibration is cleared on each app load and whenever setup starts, because the camera can move between uses.
- Debug recordings contain hand landmark positions and key presses (not video). They are downloaded only when you record or complete a labeled collection run.
