# Universal Mobile E2E Testing Template

A reusable starting point for native Android and iOS end-to-end tests using Appium 3, WebdriverIO 10, Cucumber, TypeScript, and Page Object Models. This is the single maintained framework implementation; it replaces the previous Appium 2 and Jest setup with WebdriverIO's official Cucumber runner integration.

It includes a generic app-launch smoke scenario. Product teams can add their app-specific features and Page Object Models without inheriting product-specific selectors or test data.

## Prerequisites

- Node.js 22.19 or newer and npm 10 or newer
- Android: Android SDK, a configured emulator or connected device, and a compatible Java Development Kit
- iOS: macOS with Xcode and an available simulator or connected device
- The app under test as an Android APK or iOS app bundle

Appium is installed as a project development dependency. Its platform drivers are managed using the Appium CLI.
Pinned npm overrides keep Appium's transitive `sharp` and `shell-quote` dependencies on patched releases; re-evaluate these overrides when upgrading Appium.

## Getting started

For read-only setup diagnostics, use the [offline mobile preflight](docs/mobile-preflight.md).
It never starts Appium or contacts a device; a successful result is not mobile readiness.

1. Install Node.js and dependencies:

   ```sh
   npm ci
   ```

2. Install the driver for the platform you will test:

   ```sh
   npm run appium:drivers:android
   ```

   Or, on macOS for iOS:

   ```sh
   npm run appium:drivers:ios
   ```

3. Copy `.env.example` to `.env` and set the app path and device name for your platform. Keep app binaries and credentials out of source control.

4. Start an emulator or simulator, then run:

   ```sh
   npm run test:android
   ```

   Or:

   ```sh
   npm run test:ios
   ```

The local WebdriverIO Appium service starts and stops the Appium server for the test run. Appium drivers are installed once per development/CI environment, not on every test run.

## Project structure

```text
features/
  app-launch.feature
  step-definitions/       # Thin Cucumber step bindings
src/
  page-objects/           # App-specific Page Object Models
apps/                     # Local app binaries; gitignored
.github/
  copilot-instructions.md
  workflows/quality.yml
wdio.shared.conf.ts       # Shared runner, Cucumber, Appium service, reporters
wdio.android.conf.ts      # Android capabilities
wdio.ios.conf.ts          # iOS capabilities
```

## Page Object Model convention

Keep app-specific selectors and screen interactions in Page Object Models under `src/page-objects/`. Cucumber step definitions should express scenario behavior and delegate those interactions to the page objects. Prefer accessibility identifiers agreed with the app team; do not duplicate selectors in step definitions.

The included smoke scenario checks that Appium can retrieve a non-empty native view hierarchy after starting the app. It intentionally uses no product-specific selector. Replace or extend it with checks for your app's expected initial screen.

## Quality checks

Run the same bounded checks before committing and in the existing quality workflow:

```sh
npm run check:offline
```

This aggregate runs type-checking, lint, formatting, lint-rule regression checks,
offline preflight, scenario preparation, and hierarchy-validation tests. Individual
commands remain available as `typecheck`, `lint`, `format:check`, `test:quality`,
`test:preflight`, `test:scenarios:offline`, and `test:smoke:offline`.

Type-aware lint rejects promises used as synchronous conditions, void-returning
callbacks, or object spreads. The regression checks feed invalid and valid code to
the repository's actual ESLint configuration without executing those snippets.
This is a focused async guard, not a replacement for Sonar analysis or a claim that
all Sonar findings are covered. No Sonar gate or scan exclusions are changed.

The offline test commands use Node’s native test runner with the installed tsx
loader, without the tsx CLI’s separate IPC server. They use synthetic inputs and
guarded local CLI fixtures. They do not
start Appium, install drivers, contact a device, or prove an app launch. The
`test:android` and `test:ios` commands remain the live, device-dependent smoke
entrypoints and require an approved target and platform tooling. Running the
offline aggregate in CI does not authorize or establish hosted mobile execution.

Mobile E2E execution is platform- and app-dependent; add the app build or secure
app download step for your product before wiring the live test commands into CI.

## Reports

The WDIO spec reporter prints results in the console. The Allure reporter writes raw results to `allure-results/`, which is ignored by Git. Configure your CI or Allure tooling to publish and render those results as needed.

## AI-assisted authoring

The repository-level Copilot instructions provide conventions for AI-assisted scenario and Page Object Model authoring. Treat generated tests as drafts: verify selectors with the app team and run tests against the target app. AI is not part of the execution or pass/fail path.
