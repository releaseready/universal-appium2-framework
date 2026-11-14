// Test classification: unit
// Review status: Not Reviewed
// Evidence: synthetic
// Scope: Scans git-tracked TypeScript source for the identifier `satisfies` used as a variable or parameter name, which Semgrep 1.185.0 reports as PartialParsing; it does not run Semgrep itself.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

// Semgrep reads `satisfies` followed by `:`, `=`, `,`, `;`, `(` or `)` as the
// TypeScript operator and fails to parse the line. The operator itself is
// always followed by a type, so it is not matched.
const SATISFIES_AS_IDENTIFIER = /(?<![\w.$"'/-])satisfies\s*(?:[:=,;()]|$)/m;

const repoRoot = resolve(__dirname, "../..");

test("the satisfies identifier detector flags identifier uses and allows the operator", () => {
  const flagged = [
    ["let", "satisfies: (a: string) => boolean;"].join(" "),
    ["const", "satisfies = load();"].join(" "),
    ["satisfies", "(version, range)"].join(""),
    ["function f(", "satisfies: Fn) {}"].join(""),
  ];
  for (const line of flagged) {
    assert.match(line, SATISFIES_AS_IDENTIFIER, line);
  }
  const allowed = [
    ["const config = {} ", "satisfies Config;"].join(""),
    'require("semver/functions/' + "satisfies" + '");',
    '"Node ' + "satisfies" + ' the range."',
  ];
  for (const line of allowed) {
    assert.doesNotMatch(line, SATISFIES_AS_IDENTIFIER, line);
  }
});

test("tracked TypeScript source does not use satisfies as an identifier", () => {
  const files = execFileSync("git", ["ls-files", "*.ts", "*.mts", "*.cts"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  assert.ok(files.length > 0, "expected tracked TypeScript files");
  const offenders = files.filter((file) =>
    SATISFIES_AS_IDENTIFIER.test(readFileSync(resolve(repoRoot, file), "utf8")),
  );
  assert.deepEqual(
    offenders,
    [],
    "Rename the identifier (for example satisfiesRange): Semgrep cannot parse it.",
  );
});
