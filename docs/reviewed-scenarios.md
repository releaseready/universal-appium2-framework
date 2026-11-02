# Reviewed scenario preparation (RRDMOBILE-1 offline slice)

`src/scenarios/prepare.ts` is an internal, pure offline preparation module. It
does not start Appium, discover devices, load step files, execute feature text or
call mapping handlers. It is not wired into the standalone runner or exported as
a public engine contract. Real app/build/profile approval and execution admission
remain separate responsibilities.

The caller supplies pinned source and mapping revisions, a platform, a Cucumber
tag expression and reviewed mapping metadata. These references are provenance
supplied by the caller, **not proof that review or approval occurred**. Mapping
IDs must identify separately reviewed step implementations; feature text cannot
declare handlers, selectors, imports or platform capabilities.

The maintained Cucumber Gherkin compiler expands outlines, example rows,
backgrounds, inherited tags, doc strings and tables. Cucumber tag expressions
select compiled cases, including tagged Examples groups. Each selected step must
match exactly one approved Cucumber expression supporting the requested platform.
Disjoint Android/iOS mappings are valid; overlaps on the selected platform are
ambiguous. Missing mappings, unsupported combinations, malformed input or empty
selected scenarios block the entire selection, with no schedulable cases.
No matching compiled cases returns `not-run`, never `ready`.

The returned pickles retain opaque arguments and AST node IDs for row/step
traceability, together with mapping IDs and pinned provenance. Preparation does
not transform arguments or claim that a business outcome has been asserted.
Keep real business assertions in reviewed TypeScript step definitions, actions
and selectors in page objects, and runtime execution independent of AI services.

## Offline checks and disclosed boundaries

Run using already restored locked dependencies:

```sh
./node_modules/.bin/tsx --test tests/scenarios/*.test.ts
```

The versioned `rrdmobile-1/offline-fixture-v1` fixtures are synthetic, feature-local
test data, **not** an approved public schema or customer journey. Focused tests
trace S02/S03/S05/S06 preparation and selection behavior. S01 is only compiled and
mapped, not executed. S04 uses a disclosed in-memory page double and a test-owned
outcome assertion: an open page with the wrong result fails; the correct result
succeeds. It is not real application acceptance evidence.

This slice reuses the already locked transitive Cucumber packages
`@cucumber/gherkin`, `@cucumber/messages`, `@cucumber/tag-expressions` and
`@cucumber/cucumber-expressions`. Before public integration, the exclusive
scaffold/manifest owner must review and declare required direct dependencies,
and an authoritative reviewed contract must define how selected source/tag
input and this internal preparation result join execution admission. This slice
does not define a competing public seam or change package/lock/config files.

RRDMOBILE-1 remains incomplete. Approved journeys, expected outcomes, app build,
selectors, device/profile access and actual Android/iOS behavior are
**UNVERIFIED**. No live/mobile run or hosted CI is part of these offline checks.
