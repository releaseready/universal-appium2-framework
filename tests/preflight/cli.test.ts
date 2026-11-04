import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { test } from "node:test";
import type { Report } from "../../src/preflight/index.js";
import { args, fixture } from "./fixtures.js";

const workspace = process.cwd();
function guardedNode(argv: string[], appRoot: string) {
  // Spawning the actual CLI is test orchestration, never a preflight capability.
  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--import",
      resolve("tests/preflight/guard.ts"),
      ...argv,
    ],
    {
      cwd: workspace,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 64_000,
      env: {
        ...process.env,
        TSX_DISABLE_CACHE: "1",
        PREFLIGHT_TEST_APP_ROOT: appRoot,
        MOBILE_SECRET: "SECRET_ENV_CANARY",
      },
    },
  );
}

function cli(argv: string[], appRoot: string) {
  return guardedNode(
    [resolve("scripts/mobile-preflight.ts"), ...argv],
    appRoot,
  );
}

test("S01/S05/S07 Given a locked workspace and synthetic APK, When actual CLI runs under side-effect guards, Then pass safely", async () => {
  const owned = await fixture();
  try {
    const before = await readdir(owned.root);
    for (const json of [false, true]) {
      const result = cli(
        [...args(owned.root), ...(json ? ["--json"] : [])],
        owned.root,
      );
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, "");
      assert.ok(!result.stdout.includes("SECRET_ENV_CANARY"));
      assert.ok(!result.stdout.includes(owned.root));
      assert.ok(!result.stdout.includes("SYNTHETIC_NOT_AN_INSTALLABLE_APP"));
      if (json) {
        const report = JSON.parse(result.stdout) as Report;
        assert.equal(report.schemaVersion, 1);
        assert.equal(report.evidence, "local-offline");
        assert.equal(report.exitCode, result.status);
        assert.equal(report.diagnostics.length, 9);
        assert.equal(
          report.diagnostics.filter((d) => d.code === "NOT_VERIFIED").length,
          4,
        );
        assert.ok(
          report.diagnostics.every(
            (d) =>
              Object.keys(d).sort().join(",") ===
              "check,code,message,nextAction,state",
          ),
        );
      } else assert.match(result.stdout, /NOT VERIFIED/);
    }
    const ios = cli(
      [...args(owned.root, "ios", "sample.app"), "--json"],
      owned.root,
    );
    assert.equal(ios.status, process.platform === "darwin" ? 0 : 1, ios.stderr);
    const iosReport = JSON.parse(ios.stdout) as Report;
    assert.equal(
      iosReport.diagnostics.find((d) => d.check === "host")?.code,
      process.platform === "darwin" ? "HOST_VALID" : "IOS_HOST_UNSUPPORTED",
    );
    assert.deepEqual(await readdir(owned.root), before);
    assert.equal(
      await readFile(join(owned.root, "sample.apk"), "utf8"),
      "SYNTHETIC_NOT_AN_INSTALLABLE_APP",
    );
  } finally {
    await owned.cleanup();
  }
});

test("S05 Given armed test guards, When a forbidden operation is attempted, Then the harness cannot silently pass", () => {
  const result = guardedNode(
    ["-e", "try { fetch('https://example.invalid') } catch {}"],
    workspace,
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 86, result.stderr);
});

test("S03/S04/S05/S07 Given invalid CLI inputs and an escaping symlink, When actual CLI runs, Then stable nonzero safe reports", async () => {
  const owned = await fixture();
  const outside = await fixture();
  try {
    await symlink(
      join(outside.root, "sample.apk"),
      join(owned.root, "escape.apk"),
    );
    const cases: [string[], string][] = [
      [[], "VALUE_MISSING"],
      [[...args(owned.root), "--secret=SECRET_ENV_CANARY"], "OPTION_UNKNOWN"],
      [[...args(owned.root), "--app", "sample.apk"], "OPTION_CONFLICT"],
      [args(owned.root, "unsupported"), "PLATFORM_UNSUPPORTED"],
      [args(owned.root, "android", "../outside.apk"), "APP_OUTSIDE_ROOT"],
      [
        args(owned.root, "android", "https://invalid/SECRET_ENV_CANARY.apk"),
        "APP_REMOTE",
      ],
      [args(owned.root, "android", "missing.apk"), "APP_MISSING"],
      [args(owned.root, "android", "directory.apk"), "APP_KIND"],
      [args(owned.root, "android", "escape.apk"), "APP_SYMLINK_ESCAPE"],
    ];
    for (const [argv, expected] of cases) {
      for (const json of [false, true]) {
        const result = cli([...argv, ...(json ? ["--json"] : [])], owned.root);
        assert.equal(result.error, undefined);
        assert.equal(result.status, 1, result.stderr);
        assert.equal(result.stderr, "");
        assert.ok(result.stdout.includes(expected));
        assert.ok(!result.stdout.includes("SECRET_ENV_CANARY"));
        assert.ok(!result.stdout.includes(owned.root));
        assert.ok(result.stdout.length < 6000);
        if (json)
          assert.equal((JSON.parse(result.stdout) as Report).exitCode, 1);
      }
    }
  } finally {
    await owned.cleanup();
    await outside.cleanup();
  }
});
