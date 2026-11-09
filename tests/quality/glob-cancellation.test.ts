import assert from "node:assert/strict";
import { test } from "node:test";
import { glob, globSync } from "glob";

// The scoped @appium/support override must retain normal discovery while
// stopping an already-cancelled traversal before filesystem enumeration.
test("glob preserves ordinary discovery", async () => {
  const options = { cwd: __dirname };
  assert.deepEqual(await glob("glob-cancellation.test.ts", options), [
    "glob-cancellation.test.ts",
  ]);
  assert.deepEqual(globSync("glob-cancellation.test.ts", options), [
    "glob-cancellation.test.ts",
  ]);
});

test("glob rejects pre-aborted async and sync traversal without reading directories", async () => {
  const reason = new Error("cancelled traversal");
  const signal = AbortSignal.abort(reason);
  let reads = 0;
  const unexpectedRead = () => {
    reads += 1;
    throw new Error("cancelled traversal reached filesystem");
  };
  const options = {
    cwd: __dirname,
    signal,
    fs: { readdir: unexpectedRead, readdirSync: unexpectedRead },
  };
  await assert.rejects(glob("**/*", options), (error) => error === reason);
  assert.throws(
    () => globSync("**/*", options),
    (error) => error === reason,
  );
  assert.equal(reads, 0);
});
