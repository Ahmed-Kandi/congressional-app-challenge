// Score the team's attributeKeystroke() on real, labeled recordings.
//
//   npm run evaluate -- recordings/                    every recording in a folder
//   npm run evaluate -- recordings/drill.json --verbose one line per key
//   npm run evaluate -- --list recordings/drill.json   numbered keys, to write labels
//
// Options:
//   --list              print the numbered keys and stop (no scoring)
//   --verbose           print every key: what was used, what the function said
//   --assume-expected   score recordings that have no labels as if every key
//                       was typed with the expected finger (only if that is true!)
//   --no-calibration    call the function with calibration = null
//   --lag <ms>          how late frames arrive (default: the recording's frameLagMs, else 0)
//   --delay <ms>        how long after the key the function is called (default ATTRIBUTION_DELAY_MS)
//   --json <file>       also save every row and summary as JSON
//
// Labels come from a .labels.json file next to the recording, or from inside
// the recording (data collection runs). See js/debug/labels.js for the format.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { ATTRIBUTION_IMPLEMENTED, attributeKeystroke } from "../js/core/fingerAttribution.js";
import { ATTRIBUTION_DELAY_MS } from "../js/config.js";
import { parseRecording } from "../js/debug/replay.js";
import { describeFingers, expectedFingers } from "../js/fingerMap.js";
import { evaluateRecording, formatRow, formatSummary, summarize } from "./lib/evaluate.mjs";
import { labelsForRecording, labelsPathFor, resolveLabels } from "./lib/labels.mjs";

function parseArgs(argv) {
  const options = { paths: [], list: false, verbose: false, assumeExpected: false, noCalibration: false, lag: null, delay: ATTRIBUTION_DELAY_MS, json: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const number = () => {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value)) throw new Error(`${arg} needs a number`);
      return value;
    };
    if (arg === "--list") options.list = true;
    else if (arg === "--verbose") options.verbose = true;
    else if (arg === "--assume-expected") options.assumeExpected = true;
    else if (arg === "--no-calibration") options.noCalibration = true;
    else if (arg === "--lag") options.lag = number();
    else if (arg === "--delay") options.delay = number();
    else if (arg === "--json") options.json = argv[++i];
    else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}`);
    else options.paths.push(arg);
  }
  if (options.paths.length === 0) throw new Error("Give at least one recording file or folder.");
  return options;
}

/** Recording files from the paths given (folders are searched one level deep). */
function recordingFiles(paths) {
  return paths.flatMap((path) => {
    if (!statSync(path).isDirectory()) return [path];
    return readdirSync(path)
      .filter((name) => name.endsWith(".json") && !name.endsWith(".labels.json"))
      .sort()
      .map((name) => join(path, name));
  });
}

function listKeys(recording) {
  const start = recording.frames[0]?.t ?? recording.keyEvents[0]?.t ?? 0;
  recording.keyEvents.forEach((keyEvent, i) => {
    const key = keyEvent.key === " " ? "Space" : keyEvent.key;
    const expected = expectedFingers(keyEvent.code);
    const seconds = ((keyEvent.t - start) / 1000).toFixed(2);
    console.log(`${String(i + 1).padStart(4)}  ${seconds.padStart(7)} s  ${JSON.stringify(key).padEnd(9)} ${keyEvent.code.padEnd(12)} expects ${expected.length ? describeFingers(expected) : "(no finger)"}`);
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!ATTRIBUTION_IMPLEMENTED && !options.list) {
    console.log("Note: ATTRIBUTION_IMPLEMENTED is false, so expect every answer to be null.\n");
  }
  const allRows = [];
  const report = [];
  for (const file of recordingFiles(options.paths)) {
    let recording;
    try {
      recording = parseRecording(readFileSync(file, "utf8"));
    } catch (error) {
      console.log(`Skipping ${basename(file)}: ${error.message}\n`);
      continue;
    }
    if (options.list) {
      console.log(`== ${basename(file)} (${recording.keyEvents.length} keys)`);
      listKeys(recording);
      continue;
    }
    const found = labelsForRecording(file, recording);
    let labels = found?.labels;
    let title = found ? `${basename(file)} (${found.source})` : basename(file);
    if (!labels) {
      if (!options.assumeExpected) {
        console.log(`Skipping ${basename(file)}: no labels inside it and no ${basename(labelsPathFor(file))} (or pass --assume-expected).\n`);
        continue;
      }
      labels = { default: "expected" };
      title += " (ASSUMED good form, no labels file)";
    }
    const truths = resolveLabels(recording.keyEvents, labels);
    const arrivalLagMs = options.lag ?? recording.meta?.frameLagMs ?? 0;
    const rows = evaluateRecording(recording, truths, attributeKeystroke, {
      calibration: options.noCalibration ? null : undefined,
      delayMs: options.delay,
      arrivalLagMs,
    });
    const hasGrid = Boolean(recording.meta?.calibration?.keyboardGrid);
    title += ` [lag ${arrivalLagMs.toFixed(0)} ms, ${options.noCalibration ? "no calibration" : hasGrid ? "calibration + keyboard map" : "calibration, no keyboard map"}]`;
    console.log(formatSummary(summarize(rows), title));
    if (options.verbose) for (const row of rows) console.log(formatRow(row));
    console.log("");
    allRows.push(...rows.map((row) => ({ file: basename(file), ...row })));
    report.push({ file: basename(file), summary: summarize(rows) });
  }
  if (options.list) return;
  if (report.length > 1) console.log(formatSummary(summarize(allRows), `ALL ${report.length} recordings`));
  if (options.json) {
    writeFileSync(options.json, JSON.stringify({ recordings: report, overall: summarize(allRows), rows: allRows }, null, 2));
    console.log(`Saved ${options.json}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`evaluate-recordings: ${error.message}`);
  process.exit(1);
}
