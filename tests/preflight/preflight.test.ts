import assert from "node:assert/strict";
import { realpath, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { localProbes, preflight, render } from "../../src/preflight/index.js";
import {
  args,
  fixture,
  metadata,
  metadataFixture,
  probes,
} from "./fixtures.js";

const root = join(process.cwd(), "synthetic-owned-root");
const run = (argv = args(root), overrides = {}) =>
  preflight(argv, process.cwd(), probes(overrides));
const code = (report: Awaited<ReturnType<typeof run>>, check: string) =>
  report.diagnostics.find((d) => d.check === check)?.code;

test("S01 Given explicit supported Android metadata, When checked, Then only offline inputs are verified", async () => {
  const report = await run();
  assert.equal(report.exitCode, 0);
  assert.equal(report.evidence, "test-only");
  for (const check of ["inputs", "runtime", "dependencies", "host", "app-path"])
    assert.equal(
      report.diagnostics.find((d) => d.check === check)?.state,
      "verified",
    );
  for (const check of [
    "native-tooling",
    "driver",
    "device",
    "application-execution",
  ]) {
    assert.equal(code(report, check), "NOT_VERIFIED");
    assert.equal(
      report.diagnostics.find((d) => d.check === check)?.state,
      "not-checked",
    );
  }
  assert.match(render(report, false), /not mobile readiness/);
});

test("S02 Given iOS on unsupported hosts, When checked, Then fail with a safe macOS action", async () => {
  for (const host of ["linux", "win32"]) {
    const report = await run(args(root, "ios", "sample.app"), { host });
    assert.equal(report.exitCode, 1);
    assert.equal(code(report, "host"), "IOS_HOST_UNSUPPORTED");
    assert.match(
      report.diagnostics.find((d) => d.check === "host")!.nextAction,
      /macOS/,
    );
  }
  const report = await run(args(root, "ios", "sample.app"), { host: "darwin" });
  assert.equal(report.exitCode, 0);
  assert.equal(code(report, "native-tooling"), "NOT_VERIFIED");
});

test("S03 Given missing, unknown, conflicting or unsupported options, When parsed, Then reject without probing", async () => {
  const cases: [string[], string][] = [
    [[], "VALUE_MISSING"],
    [["--platform"], "VALUE_MISSING"],
    [args(root, "windows"), "PLATFORM_UNSUPPORTED"],
    [[...args(root), "--platform", "android"], "OPTION_CONFLICT"],
    [[...args(root), "--json", "--json"], "OPTION_CONFLICT"],
    [[...args(root), "--unknown"], "OPTION_UNKNOWN"],
    [[...args(root), "--app=sample.apk"], "OPTION_UNKNOWN"],
    [[...args(root), "extra"], "OPTION_UNKNOWN"],
    [args(root, "android", "\u0000secret"), "VALUE_INVALID"],
    [args(root, "android", "x".repeat(4097)), "VALUE_INVALID"],
    [["--json"], "VALUE_MISSING"],
  ];
  for (const [argv, expected] of cases) {
    let attempts = 0;
    const report = await run(argv, {
      metadata: async () => {
        attempts++;
        throw new Error("must not probe");
      },
      realpath: async () => {
        attempts++;
        throw new Error("must not probe");
      },
    });
    assert.equal(report.exitCode, 1);
    assert.equal(code(report, "inputs"), expected);
    assert.equal(attempts, 0);
  }
});

test("S03 Given incompatible Node versions and semver boundaries, When checked, Then never compare strings or guess", async () => {
  for (const version of [
    "22.18.9",
    "20.99.0",
    "9.99.0",
    "22.19.0-rc.1",
    "garbage",
    "",
  ]) {
    const report = await run(args(root), { nodeVersion: version });
    assert.equal(report.exitCode, 1, version);
    assert.equal(code(report, "runtime"), "NODE_INCOMPATIBLE");
  }
  for (const version of ["22.19.0", "22.20.0", "24.4.0", "100.0.0"]) {
    assert.equal(
      (await run(args(root), { nodeVersion: version })).exitCode,
      0,
      version,
    );
  }
});

test("S03 Given malformed, unsupported or conflicting dependencies, When checked, Then fail stable metadata diagnostics", async () => {
  const cases: unknown[] = [null, {}, { manifest: {} }];
  for (const name of ["appium", "@wdio/cli", "typescript", "tsx"]) {
    for (const version of ["garbage", "2.0.0", "99.0.0"]) {
      const data = metadata();
      data.installed[name] = { version };
      cases.push(data);
    }
    const data = metadata();
    delete data.installed[name];
    cases.push(data);
  }
  const conflict = metadata();
  conflict.lock.packages["node_modules/appium"] = { version: "3.7.0" };
  cases.push(conflict);
  const unsupported = metadata();
  unsupported.manifest.engines.node = "*";
  cases.push(unsupported);
  for (const name of ["appium", "@wdio/cli", "typescript", "tsx"] as const) {
    const data = metadata();
    data.manifest.devDependencies[name] = "99.0.0";
    data.lock.packages[""].devDependencies![name] = "99.0.0";
    data.lock.packages[`node_modules/${name}`].version = "99.0.0";
    data.installed[name] = { version: "99.0.0" };
    cases.push(data);
  }
  for (const data of cases) {
    const report = await run(args(root), { metadata: async () => data });
    assert.equal(report.exitCode, 1);
    assert.ok(report.diagnostics.some((d) => d.state === "invalid"));
  }
});

test("S03/S06 Given actual local dependency metadata, When missing, malformed, oversized or symlinked, Then fail safely without mobile imports", async () => {
  const owned = await metadataFixture();
  try {
    const runLocal = () => preflight(args(owned.root), owned.root);
    assert.equal((await runLocal()).exitCode, 0);
    await writeFile(join(owned.root, "package.json"), "{SECRET_RAW_ERROR");
    let report = await runLocal();
    assert.equal(code(report, "dependencies"), "METADATA_INVALID");
    assert.ok(!render(report, true).includes("SECRET_RAW_ERROR"));
    await writeFile(join(owned.root, "package.json"), "x".repeat(2_000_001));
    assert.equal(code(await runLocal(), "dependencies"), "METADATA_INVALID");
    await unlink(join(owned.root, "package.json"));
    assert.equal(
      code(await runLocal(), "dependencies"),
      "METADATA_UNAVAILABLE",
    );
    await writeFile(
      join(owned.root, "redirect.apk"),
      JSON.stringify(metadata().manifest),
    );
    await symlink(
      join(owned.root, "redirect.apk"),
      join(owned.root, "package.json"),
    );
    report = await runLocal();
    assert.equal(code(report, "dependencies"), "METADATA_INVALID");
    assert.equal(report.exitCode, 1);
    const local = localProbes(owned.root);
    assert.equal(local.host, process.platform);
  } finally {
    await owned.cleanup();
  }
});

test("S03/S06 Given metadata failures, When reported, Then preserve dependency and unchecked runtime diagnostics in order", async () => {
  for (const failure of [
    {
      metadata: async () => {
        throw new Error("private read failure");
      },
      state: "unavailable",
      code: "METADATA_UNAVAILABLE",
      message: "Required local dependency metadata could not be checked.",
      nextAction:
        "Restore the repository manifest, lockfile and locked dependencies in a separate setup step.",
    },
    {
      metadata: async () => {
        throw new SyntaxError("private parse failure");
      },
      state: "invalid",
      code: "METADATA_INVALID",
      message: "Required local dependency metadata could not be checked.",
      nextAction:
        "Restore the repository manifest, lockfile and locked dependencies in a separate setup step.",
    },
    {
      metadata: async () => null,
      state: "invalid",
      code: "METADATA_INVALID",
      message: "Required dependency metadata is malformed.",
      nextAction: "Restore the repository manifest and lockfile.",
    },
  ]) {
    const report = await run(args(root), { metadata: failure.metadata });
    assert.equal(report.exitCode, 1);
    assert.deepEqual(report.diagnostics.slice(1, 3), [
      {
        check: "dependencies",
        state: failure.state,
        code: failure.code,
        message: failure.message,
        nextAction: failure.nextAction,
      },
      {
        check: "runtime",
        state: "not-checked",
        code: "METADATA_REQUIRED",
        message: "Node compatibility was not checked.",
        nextAction: "Restore required metadata and rerun.",
      },
    ]);
    assert.equal(report.diagnostics.length, 9);
    assert.equal(code(report, "app-path"), "APP_PATH_VALID");
  }
});

test("S04 Given colon-containing local names, When checked, Then do not misclassify them as remote URLs", async () => {
  for (const app of ["build:1.apk", "release.v2:final.apk"]) {
    const report = await run(args("ci-run:42", "android", app));
    assert.equal(report.exitCode, 0);
    assert.equal(code(report, "app-path"), "APP_PATH_VALID");
  }
});

test("S04 Given remote, outside-root or unsupported paths, When checked, Then reject before filesystem access", async () => {
  const cases: [string[], string][] = [
    [args(root, "android", "https://example.invalid/secret.apk"), "APP_REMOTE"],
    [args("https://example.invalid/root"), "APP_REMOTE"],
    [args(root, "android", "custom+scheme://server/app.apk"), "APP_REMOTE"],
    [args(root, "android", "file:sample.apk"), "APP_REMOTE"],
    [args(root, "android", "https:sample.apk"), "APP_REMOTE"],
    [args(root, "android", "\\\\server\\share\\app.apk"), "APP_REMOTE"],
    [args(root, "android", "//server/share/app.apk"), "APP_REMOTE"],
    [args(root, "android", "../outside.apk"), "APP_OUTSIDE_ROOT"],
    [args(root, "android", `${root}-sibling/sample.apk`), "APP_OUTSIDE_ROOT"],
    [args(root, "android", root), "APP_OUTSIDE_ROOT"],
    [args(root, "android", "sample.zip"), "APP_FORMAT"],
  ];
  for (const [argv, expected] of cases) {
    let attempts = 0;
    const report = await run(argv, {
      realpath: async () => {
        attempts++;
        throw new Error("must not inspect");
      },
    });
    assert.equal(report.exitCode, 1);
    assert.equal(code(report, "app-path"), expected);
    assert.equal(attempts, 0);
  }
});

test("S04 Given owned synthetic fixtures, When stat/realpath checked, Then missing, wrong-kind and symlink escapes fail", async () => {
  const owned = await fixture();
  const outside = await fixture();
  try {
    await symlink(
      join(outside.root, "sample.apk"),
      join(owned.root, "escape.apk"),
    );
    await symlink(outside.root, join(owned.root, "escape-dir"));
    await symlink(
      join(owned.root, "sample.apk"),
      join(owned.root, "inside.apk"),
    );
    const cases: [string, string, string][] = [
      ["missing.apk", "android", "APP_MISSING"],
      ["directory.apk", "android", "APP_KIND"],
      ["file.app", "ios", "APP_KIND"],
      ["escape.apk", "android", "APP_SYMLINK_ESCAPE"],
      ["escape-dir/sample.apk", "android", "APP_SYMLINK_ESCAPE"],
    ];
    for (const [app, platform, expected] of cases) {
      const report = await run(args(owned.root, platform, app), {
        realpath,
        stat,
        host: "darwin",
      });
      assert.equal(report.exitCode, 1);
      assert.equal(code(report, "app-path"), expected);
    }
    assert.equal(
      (await run(args(owned.root, "android", "inside.apk"), { realpath, stat }))
        .exitCode,
      0,
    );
    assert.equal(
      code(
        await run(args(join(owned.root, "sample.apk")), { realpath, stat }),
        "app-path",
      ),
      "APP_ROOT_KIND",
    );
  } finally {
    await owned.cleanup();
    await outside.cleanup();
  }
});

test("S05/S06 Given secret-bearing inaccessible probes, When reported, Then states are honest and errors are bounded and sanitized", async () => {
  const canary = "SECRET_CANARY_TOKEN_WITH_PRIVATE_PATH";
  for (const error of [new Error(canary), new SyntaxError(canary)]) {
    const report = await run(args(root), {
      metadata: async () => {
        throw error;
      },
    });
    assert.equal(report.exitCode, 1);
    assert.equal(code(report, "runtime"), "METADATA_REQUIRED");
    assert.equal(
      report.diagnostics.find((d) => d.check === "dependencies")?.state,
      error instanceof SyntaxError ? "invalid" : "unavailable",
    );
    for (const json of [true, false]) {
      const output = render(report, json);
      assert.ok(!output.includes(canary));
      assert.ok(!output.includes(root));
      assert.ok(output.length < 6000);
    }
  }
  const report = await run(args(root), {
    stat: async () => {
      throw Object.assign(new Error(canary), { code: "EACCES" });
    },
  });
  assert.equal(report.exitCode, 1);
  assert.equal(code(report, "app-path"), "APP_UNAVAILABLE");
  assert.equal(report.evidence, "test-only");
  assert.ok(!render(report, true).includes(canary));
});
