import { test, expect } from "@playwright/test";

test("a live camera produces a playable in-memory lesson recording", async ({ page }) => {
  await page.goto("/index.html?skipSetup=1");
  const result = await page.evaluate(async () => {
    const { LessonVideoRecorder } = await import("../../js/lessonVideo.js");
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const recorder = new LessonVideoRecorder();
    try {
      const started = recorder.start(stream);
      await new Promise((resolve) => setTimeout(resolve, 650));
      const clip = await recorder.stop();
      if (!clip) return { started, playable: false };
      const video = document.createElement("video");
      video.src = clip.url;
      video.muted = true;
      video.playsInline = true;
      await new Promise((resolve, reject) => {
        video.addEventListener("loadeddata", resolve, { once: true });
        video.addEventListener("error", () => reject(new Error("Recorded video did not decode")), { once: true });
        video.load();
      });
      video.currentTime = 0.3;
      await new Promise((resolve) => {
        video.addEventListener("seeked", resolve, { once: true });
        setTimeout(resolve, 700);
      });
      await video.play();
      return {
        started,
        playable: video.videoWidth > 0 && video.videoHeight > 0,
        durationMs: clip.durationMs,
        seekable: video.seekable.length > 0,
        seekedToMistake: video.currentTime >= 0.2,
        autoPlayedMuted: !video.paused,
      };
    } finally {
      recorder.clear();
      stream.getTracks().forEach((track) => track.stop());
    }
  });
  expect(result.started).toBe(true);
  expect(result.playable).toBe(true);
  expect(result.durationMs).toBeGreaterThan(400);
  expect(result.seekable).toBe(true);
  expect(result.seekedToMistake).toBe(true);
  expect(result.autoPlayedMuted).toBe(true);
});

test("the replay follows the stats and keeps feedback upright over a rotated video", async ({ page }) => {
  await page.goto("/index.html?skipSetup=1");
  const layout = await page.evaluate(() => {
    document.querySelector("#screen-exercise").hidden = true;
    const summary = document.querySelector("#screen-summary");
    summary.hidden = false;
    const section = document.querySelector("#mistake-replay-section");
    section.hidden = false;
    const frame = document.querySelector("#mistake-replay-video-frame");
    frame.hidden = false;
    frame.classList.add("is-rotated");
    const stats = document.querySelector(".summary-stats").getBoundingClientRect();
    const replay = section.getBoundingClientRect();
    const summaryBox = summary.getBoundingClientRect();
    return {
      belowStats: replay.top >= stats.bottom,
      centered: Math.abs((replay.left + replay.right) / 2 - (summaryBox.left + summaryBox.right) / 2) < 2,
      videoTransform: getComputedStyle(frame.querySelector("video")).transform,
      overlayTransform: getComputedStyle(frame.querySelector("canvas")).transform,
    };
  });
  expect(layout.belowStats).toBe(true);
  expect(layout.centered).toBe(true);
  expect(layout.videoTransform).not.toBe("none");
  expect(layout.overlayTransform).toBe("none");
});
