import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { ESLint } from "eslint";

const root = resolve(__dirname, "../..");
const eslint = new ESLint({ cwd: root });
const filePath = resolve(root, "src/page-objects/app.page.ts");
const rule = "@typescript-eslint/no-misused-promises";

// lintText uses a real project-covered path but never writes or executes a snippet.
const invalid = [
  ["condition", 'export const ready = Promise.resolve(true) ? "yes" : "no";'],
  [
    "void callback",
    "export const timer = setTimeout(async () => { await Promise.resolve(); }, 0);",
  ],
  ["spread", "export const copied = { ...Promise.resolve({ ready: true }) };"],
] as const;

for (const [kind, source] of invalid) {
  test(`typed lint rejects a promise used as a synchronous ${kind}`, async () => {
    const [result] = await eslint.lintText(source, { filePath });
    assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
    assert.equal(result.errorCount, 1, JSON.stringify(result.messages));
    assert.equal(result.messages[0]?.ruleId, rule);
    assert.equal(result.messages[0]?.severity, 2);
  });
}

test("typed lint accepts awaited values and synchronous callbacks", async () => {
  const [result] = await eslint.lintText(
    `export async function ready() {
      const value = await Promise.resolve(true);
      const copied = { ...await Promise.resolve({ ready: value }) };
      return copied.ready ? "yes" : "no";
    }
    export const timer = setTimeout(() => {
      void ready().catch(() => {});
    }, 0);`,
    { filePath },
  );
  assert.equal(result.errorCount, 0, JSON.stringify(result.messages));
  assert.equal(result.warningCount, 0, JSON.stringify(result.messages));
});
