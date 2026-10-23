// Turn a labeled recording into a small regression fixture for `npm run test:core`.
//
//   npm run fixture -- <recording.json> <fixture-name> [--keys 1-30] [--assume-expected]
//
// Writes tests/fixtures/recordings/<fixture-name>.json and .labels.json:
// only the chosen keys, only the frames near them, numbers rounded to 4
// decimals (0.0001 of the image is a tenth of a pixel at 1280 wide), so the
// file stays small enough to commit. Recordings hold hand landmarks only,
// never video.
//
// --assume-expected writes labels saying every key was typed with the expected
// finger. Only use it if that is true, and say so in the notes.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FRAME_BUFFER_WINDOW_MS } from "../js/config.js";
import { parseRecording } from "../js/debug/replay.js";
import { labelsFromTruths, labelsPathFor, loadLabels, parseKeyList, resolveLabels } from "./lib/labels.mjs";

export const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "tests", "fixtures", "recordings");
// Keep frames up to this long after each kept key (covers ATTRIBUTION_DELAY_MS with room to spare).
const KEEP_AFTER_KEY_MS = 500;

const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;

function roundFrame(frame) {
  return {
    t: round(frame.t, 1),
    hands: frame.hands.map((hand) => ({
      side: hand.side,
      score: round(hand.score ?? 1, 2),
      landmarks: hand.landmarks.map((p) => ({ x: round(p.x, 4), y: round(p.y, 4), z: round(p.z, 4) })),
    })),
  };
}

/**
 * Trim a recording to some of its keys, keeping every frame the app could
 * have used for them.
 * @param {number[]|null} keyNumbers  1-based; null keeps every key
 */
export function trimRecording(recording, truths, keyNumbers, source) {
  const keep = keyNumbers ? new Set(keyNumbers) : null;
  const kept = recording.keyEvents.map((keyEvent, i) => ({ keyEvent, truth: truths[i], n: i + 1 })).filter(({ n }) => !keep || keep.has(n));
  if (kept.length === 0) throw new Error("No keys left to keep.");
  const windows = kept.map(({ keyEvent }) => [keyEvent.t - FRAME_BUFFER_WINDOW_MS, keyEvent.t + KEEP_AFTER_KEY_MS]);
  const frames = recording.frames.filter((frame) => windows.some(([from, to]) => frame.t >= from && frame.t <= to)).map(roundFrame);
  const keyEvents = kept.map(({ keyEvent }) => ({ code: keyEvent.code, key: keyEvent.key, t: keyEvent.t }));
  const { meta = {} } = recording;
  return {
    recording: {
      format: recording.format,
      version: recording.version,
      meta: {
        settings: meta.settings ?? null,
        calibration: meta.calibration ?? null,
        timestampSource: meta.timestampSource ?? null,
        delegate: meta.delegate ?? null,
        frameLagMs: meta.frameLagMs ?? null,
        exercise: meta.exercise ?? null,
        fixture: { source, keys: keyNumbers ? `${keyNumbers[0]}-${keyNumbers[keyNumbers.length - 1]}` : "all", createdAt: new Date().toISOString() },
      },
      frames,
      keyEvents,
    },
    truths: kept.map(({ truth }) => truth),
  };
}

function main() {
  const args = process.argv.slice(2);
  const assumeExpected = args.includes("--assume-expected");
  const keysAt = args.indexOf("--keys");
  const keyNumbers = keysAt >= 0 ? parseKeyList(args[keysAt + 1]) : null;
  const positional = args.filter((arg, i) => !arg.startsWith("--") && !(keysAt >= 0 && i === keysAt + 1));
  const [recordingPath, name] = positional;
  if (!recordingPath || !name || !/^[a-z0-9-]+$/.test(name)) {
    throw new Error("Usage: npm run fixture -- <recording.json> <fixture-name> [--keys 1-30] [--assume-expected]  (name: lowercase letters, digits, dashes)");
  }
  const recording = parseRecording(readFileSync(recordingPath, "utf8"));
  let labels = loadLabels(labelsPathFor(recordingPath));
  if (!labels) {
    if (!assumeExpected) throw new Error(`No ${basename(labelsPathFor(recordingPath))} next to the recording (or pass --assume-expected).`);
    labels = { default: "expected", verified: false, notes: "ASSUMED: every key typed with the expected finger. Not checked by a person yet." };
  }
  const truths = resolveLabels(recording.keyEvents, labels);
  const trimmed = trimRecording(recording, truths, keyNumbers, basename(recordingPath));
  const { default: _default, fingers: _fingers, skip: _skip, ...extra } = labels;
  const fixtureLabels = labelsFromTruths(trimmed.recording.keyEvents, trimmed.truths, { ...extra, source: basename(recordingPath) });

  mkdirSync(FIXTURE_DIR, { recursive: true });
  const recordingOut = join(FIXTURE_DIR, `${name}.json`);
  const labelsOut = join(FIXTURE_DIR, `${name}.labels.json`);
  const text = JSON.stringify(trimmed.recording);
  writeFileSync(recordingOut, text);
  writeFileSync(labelsOut, `${JSON.stringify(fixtureLabels, null, 2)}\n`);
  console.log(`Wrote ${recordingOut} (${trimmed.recording.keyEvents.length} keys, ${trimmed.recording.frames.length} frames, ${(text.length / 1024).toFixed(0)} KB)`);
  console.log(`Wrote ${labelsOut}`);
  console.log("Add its targets to tests/fixtures/recordings/targets.json (or it uses \"default\").");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(`make-fixture: ${error.message}`);
    process.exit(1);
  }
}
