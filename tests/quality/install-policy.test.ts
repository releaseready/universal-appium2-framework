import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("quality CI disables dependency lifecycle scripts and runs the offline checks explicitly", () => {
  const workflow = readFileSync(
    resolve(__dirname, "../../.github/workflows/quality.yml"),
    "utf8",
  );
  // This workflow uses two single-line commands. A different command shape
  // requires a deliberate review rather than silently weakening install safety.
  const commands = workflow
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("run:"))
    .map((line) => line.slice("run:".length).trim());
  assert.deepEqual(commands, [
    "npm ci --ignore-scripts",
    "npm run check:offline",
  ]);
});
