# Offline mobile setup preflight

This standalone diagnostic implements [RRDMOBILE-9](https://noisegatemusicstudios.atlassian.net/browse/RRDMOBILE-9).
It does not import WDIO configuration, load `.env`, start Appium, install tools,
contact devices, create sessions, use AI, or contact central/customer services.
RRDMOBILE-8 and real-device execution remain separate and **NOT VERIFIED**.

## Command

Use a supported Node workspace (Node >=22.19.0) with its locked dependencies already
installed. Dependency installation is a separate, explicitly authorized setup step;
preflight never installs anything.

```sh
npm run preflight:mobile -- --platform android --app-root <owned-directory> --app <relative-path.apk>
npm run preflight:mobile -- --platform ios --app-root <owned-directory> --app <relative-path.app>
npm run --silent preflight:mobile -- --platform android --app-root <owned-directory> --app <relative-path.apk> --json
```

Required flags: `--platform` (`android` or `ios`, exact lower case), `--app-root`
(explicit owned local directory), `--app` (path relative to that root, or an absolute
path inside it). Optional flag: `--json` (no value).
Only space-separated flags/values are accepted. Duplicate flags, positional values,
unknown flags, `--flag=value`, missing values, control characters and values longer
than 4096 characters fail; there is no environment/configuration fallback or guessed device.
The caller is responsible for selecting an owned root; filesystem permissions do
not establish organizational ownership.

The root is resolved against the current directory. Both lexical and canonical
containment must hold strictly inside the explicit root. Ordinary colon-containing
local names are accepted; `scheme://` prefixes and reserved `http:`, `https:`,
`ftp:`, `file:`, `smb:` and `data:` URI prefixes are rejected. Remote URLs, network
share paths, symlink escapes and missing paths fail. Android `.apk` must be a regular
file; iOS simulator `.app` must be a directory. Internal symlinks are allowed when
their canonical target stays inside the canonical root. Only `stat` and `realpath`
inspect the app: no contents, directory traversal, unpacking, hashes, signing,
installation or runtime validity checks. Symlinks/content can change after inspection;
this is a diagnostic, not a secure execution authorization.

The command reads only the repository's `package.json`, `package-lock.json`, and
installed `package.json` metadata for Appium, WDIO CLI, TypeScript and tsx.
Metadata must be non-symlinked regular files (including their ancestor paths) of
at most 2 MB. Versions must be exact, supported
(Appium 3, WDIO 10, TypeScript >=5.9 <6, tsx 4), and agree across declared, locked
and installed metadata including lock-root declarations. Node must satisfy the
current repository engine contract `>=22.19.0`. The maintained `semver` parser
already in this locked dependency tree is reused; no packages are added or upgraded.
This is not an integrity audit of all transitive dependencies. macOS satisfies only
the iOS host prerequisite, not Xcode or simulator readiness.

## Reports and exits

Exit **0** means required offline inputs passed, never that mobile tests passed.
Exit **1** means at least one required check is invalid or unavailable.
Native tooling, installed drivers, device availability and application execution
always remain `not-checked` with `NOT_VERIFIED` and separate next actions.

JSON output is a single report (use npm `--silent` to suppress npm's own banner):
`schemaVersion: 1`, `evidence: "local-offline" | "test-only"`, `exitCode: 0 | 1`,
and `diagnostics`. Each diagnostic has `check`, `state`, `code`, `message`, and
`nextAction` strings. `state` is `verified` (this limited check passed), `invalid`
(a checked input failed), `unavailable` (a permitted observation could not complete),
or `not-checked` (no observation). Both renderers use bounded static messages,
without echoing paths, options, environment secrets or raw exceptions.
Injected library probes automatically label the whole report `test-only`; they
cannot certify a local workspace or any real device. There is no CLI probe override.

| Stable code                                                                        | Meaning                                                |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `INPUTS_VALID`, `NODE_VALID`, `DEPENDENCIES_VALID`, `HOST_VALID`, `APP_PATH_VALID` | Limited offline check passed                           |
| `VALUE_MISSING`, `VALUE_INVALID`, `OPTIONS_INVALID`                                | Missing, malformed or excessive input                  |
| `OPTION_UNKNOWN`, `OPTION_CONFLICT`, `PLATFORM_UNSUPPORTED`                        | Unsupported or ambiguous explicit option               |
| `METADATA_INVALID`, `DEPENDENCIES_INCOMPATIBLE`, `NODE_INCOMPATIBLE`               | Invalid/conflicting metadata or unsupported runtime    |
| `METADATA_UNAVAILABLE`, `APP_UNAVAILABLE`                                          | Required metadata could not be observed                |
| `IOS_HOST_UNSUPPORTED`                                                             | Move iOS execution to a separately prepared macOS host |
| `APP_REMOTE`, `APP_OUTSIDE_ROOT`, `APP_SYMLINK_ESCAPE`, `APP_FORMAT`               | Unsafe or unsupported path                             |
| `APP_MISSING`, `APP_ROOT_KIND`, `APP_KIND`                                         | Missing path or incorrect file/directory kind          |
| `INPUTS_REQUIRED`, `METADATA_REQUIRED`, `NOT_VERIFIED`                             | Observation was not performed                          |

## Offline acceptance

```sh
npm run typecheck
npm run lint
npm run format:check
npm run test:preflight
```

These commands do not run WDIO. Tests use Node's official test runner with readable
Given/When/Then names; they do not require Cucumber's device runner. All app fixtures
are synthetic files/directories made in owned temporary roots and cleaned afterwards;
they are deliberately not installable applications.

| Jira scenario | Executable evidence in `tests/preflight/`                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| S01           | Supported Android metadata and actual CLI success; all execution checks remain unverified                                                      |
| S02           | Injected Linux/Windows iOS failure and macOS host-only success                                                                                 |
| S03           | Missing/unknown/duplicate/malformed options, Node semver boundaries, unsupported/conflicting/malformed dependency metadata; CLI negative cases |
| S04           | Remote/outside/sibling paths, missing/wrong-kind fixtures, direct and ancestor symlink escapes, contained symlinks; actual CLI failures        |
| S05           | Actual CLI success/error paths under network/subprocess/write/app-read guards; secret canaries and unchanged fixtures                          |
| S06           | Inaccessible filesystem/metadata doubles, invalid/unavailable/not-checked/verified distinctions, automatic test-only labeling                  |
| S07           | Strict checks, full offline suite and actual CLI; recorded red-to-green regression evidence in the PR                                          |

The CLI harness spawns Node only to exercise the actual entrypoint. It loads the
existing tsx TypeScript launcher before arming test-only side-effect guards; launcher
initialization is tooling, not a preflight subprocess capability. Preflight itself
never spawns a subprocess. No device, emulator or Appium service runs. The guards
forbid network/service/process calls, filesystem writes and app-content reads
after initialization; static import review complements them.
The CLI cases and the guard's forbidden-operation self-test share the same
guarded Node launcher, so guard loading, process limits and environment canaries
cannot drift between those paths. Metadata read, parse and shape failures share
one diagnostic emitter; regression checks preserve their distinct messages,
states, ordering and unchecked-runtime result.

For a red-to-green demonstration, deliberately remove the canonical containment
rejection in `checkApp`, run the S04 test by name, observe a nonzero test exit, then
restore that exact rule and rerun. Never leave the mutation in the committed tree.
Locked installation requires separate permission and a supported, clean dependency
workspace; do not substitute tooling or claim a blocked installation passed.
Done requires all seven offline criteria evidenced, independent review clear, and
the PR merged. Real-device execution remains explicitly unverified even then.
