// Regression tests on REAL recordings for the team's attributeKeystroke().
//
// Each fixture in tests/fixtures/recordings is a trimmed real recording plus a
// labels file saying which finger really pressed each key (make them with
// `npm run fixture`). Targets live in tests/fixtures/recordings/targets.json.
// Like the synthetic tests next to this file, these fail until the function exists.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { attributeKeystroke } from "../../js/core/fingerAttribution.js";
import { parseRecording } from "../../js/debug/replay.js";
import { evaluateRecording, formatSummary, summarize } from "../../scripts/lib/evaluate.mjs";
import { labelsForRecording, resolveLabels } from "../../scripts/lib/labels.mjs";

const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/recordings/", import.meta.url));
const targets = JSON.parse(readFileSync(join(FIXTURE_DIR, "targets.json"), "utf8"));
const fixtureNames = readdirSync(FIXTURE_DIR)
  .filter((name) => name.endsWith(".json") && !name.endsWith(".labels.json") && name !== "targets.json")
  .sort();

test("there is at least one real recording fixture", () => {
  assert.ok(fixtureNames.length > 0, `no fixtures in ${FIXTURE_DIR}`);
});

for (const fileName of fixtureNames) {
  const path = join(FIXTURE_DIR, fileName);
  const name = fileName.replace(/\.json$/, "");
  const recording = parseRecording(readFileSync(path, "utf8"));
  const { labels } = labelsForRecording(path, recording);
  const truths = resolveLabels(recording.keyEvents, labels);
  const arrivalLagMs = recording.meta?.frameLagMs ?? 0;
  const run = () => evaluateRecording(recording, truths, attributeKeystroke, { arrivalLagMs });
  const unverified = labels.verified === false ? " (labels NOT verified by a person yet)" : "";

  test(`${name}: answers are valid and identical on every run`, () => {
    const first = run();
    const second = run();
    assert.deepEqual(first.flatMap((row) => (row.problem ? [`key ${row.number}: ${row.problem}`] : [])), [], "invalid answers");
    assert.deepEqual(
      second.map((row) => row.result),
      first.map((row) => row.result),
      "attributeKeystroke gave different answers for the same input (does it use Math.random, Date.now or saved state?)",
    );
  });

  test(`${name}: meets its targets${unverified}`, () => {
    const goal = { ...targets.default, ...targets[name] };
    const summary = summarize(run());
    const report = `\n${formatSummary(summary, name)}\n`;
    assert.ok((summary.coverage ?? 0) >= goal.minCoverage, `coverage ${summary.coverage} below ${goal.minCoverage}${report}`);
    assert.ok((summary.fingerAccuracy ?? 0) >= goal.minFingerAccuracy, `finger accuracy ${summary.fingerAccuracy} below ${goal.minFingerAccuracy}${report}`);
    assert.ok((summary.falseAlarmRate ?? 0) <= goal.maxFalseAlarmRate, `false alarm rate ${summary.falseAlarmRate} above ${goal.maxFalseAlarmRate}${report}`);
  });
}
