// Label files on disk. The format and the helpers that work on label data are
// in js/debug/labels.js (shared with the app's data collection run).
//
// A recording "typing-recording-X.json" is labeled by "typing-recording-X.labels.json"
// next to it, or by a `labels` object inside the recording itself (data
// collection runs save them that way). A labels file wins if both exist.

import { existsSync, readFileSync } from "node:fs";
import { validateLabels } from "../../js/debug/labels.js";

export {
  formatKeyList,
  labelsFromTruths,
  parseKeyList,
  resolveLabels,
  validateLabels,
} from "../../js/debug/labels.js";

export function labelsPathFor(recordingPath) {
  return recordingPath.replace(/\.json$/i, "") + ".labels.json";
}

/** Read and check a labels file. Returns null when the file does not exist. */
export function loadLabels(labelsPath) {
  if (!existsSync(labelsPath)) return null;
  let labels;
  try {
    labels = JSON.parse(readFileSync(labelsPath, "utf8"));
  } catch (error) {
    throw new Error(`${labelsPath} is not valid JSON: ${error.message}`);
  }
  validateLabels(labels, labelsPath);
  return labels;
}

/**
 * Labels for a recording: its .labels.json file, else the labels saved inside
 * it, else null. Returns { labels, source } so reports can say where they came from.
 */
export function labelsForRecording(recordingPath, recording) {
  const fromFile = loadLabels(labelsPathFor(recordingPath));
  if (fromFile) return { labels: fromFile, source: "labels file" };
  if (recording.labels) {
    validateLabels(recording.labels, `labels inside ${recordingPath}`);
    return { labels: recording.labels, source: "labels inside the recording" };
  }
  return null;
}
