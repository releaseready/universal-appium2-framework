# Mobile E2E test conventions

- Use Cucumber feature files for readable user scenarios and TypeScript step definitions as thin orchestration.
- Put app selectors and screen actions in Page Object Models under `src/page-objects/`; prefer accessibility identifiers supplied by the app team.
- Keep assertions about scenario outcomes in step definitions. Avoid duplicating selectors or low-level interactions across steps.
- Do not invent selectors, credentials, app behavior, or device capabilities. Ask for missing app-specific details or keep examples explicitly generic.
- Prefer official WebdriverIO, Cucumber, and Appium APIs and packages. Do not add framework wrappers or custom test infrastructure without a concrete need.
- AI assistance may draft scenarios or page objects, but generated tests must be reviewed and run against the target app. Test execution must not depend on an AI service.

## Tests and classification

- **Every new or changed piece of logic ships with tests in the same change.** Prefer end-to-end (E2E) tests that exercise the real user or service path. Where E2E is not possible yet, add the clearest lower-level test (integration, contract, component or unit) and say in the pull request why E2E was not possible.
- **Classify every test file.** Each new or changed test file starts with a header in its own comment syntax:

  ```text
  Test classification: unit | component | contract | integration | e2e
  Review status: Not Reviewed
  Evidence: synthetic | real
  Scope: one sentence on what the test exercises and what it does not
  ```

  The classification describes scope, not the runner. Use the most conservative category for mixed files. Call a test `e2e` only when it goes through the real user or service path. In-memory compositions with test doubles are `integration`.
- **Only the founder reviews tests.** Never set a review status other than `Not Reviewed`, and never describe tests as reviewed or approved. Tests are onboarded into ReleaseReady, where they start as Not Reviewed and the founder reviews and approves them there.
- **Tests prove real outcomes.** Each guard has a test that fails if the guard is removed. Use synthetic fixtures unless real evidence is stated in the header.
