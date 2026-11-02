import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CucumberExpression,
  ParameterTypeRegistry,
} from "@cucumber/cucumber-expressions";
import { prepareScenarios } from "../../src/scenarios/prepare.js";
import { fixture, fixtureVersion, source } from "./fixtures.js";

test("S01/S05 compiles only tagged example rows with backgrounds and provenance", () => {
  const prepared = prepareScenarios(fixture());
  assert.equal(prepared.status, "ready");
  assert.equal(prepared.mappingRevision, fixtureVersion);
  assert.deepEqual(prepared.source, {
    uri: "synthetic.feature",
    revision: fixtureVersion,
  });
  assert.equal(prepared.selectedCount, 2);
  assert.deepEqual(
    prepared.cases.map(({ pickle }) => pickle.name),
    ["Review alpha", "Review beta"],
  );
  assert.deepEqual(
    prepared.cases[0].pickle.steps.map(({ text }) => text),
    [
      "the synthetic account is open",
      'the synthetic item "alpha" is selected',
      'the synthetic result should be "accepted"',
    ],
  );
  assert.deepEqual(
    prepared.cases[0].steps.map(({ mappingId }) => mappingId),
    ["synthetic.open", "synthetic.select.android", "synthetic.outcome"],
  );
  assert.notEqual(prepared.cases[0].pickle.id, prepared.cases[1].pickle.id);
  assert.equal(new Set(prepared.cases[0].pickle.astNodeIds).size, 2);
});

test("S02 reports all missing and ambiguous selected steps; releases no partial cases", () => {
  const input = fixture();
  const prepared = prepareScenarios(
    fixture({
      mappings: [
        ...input.mappings.filter(({ id }) => id !== "synthetic.outcome"),
        {
          id: "duplicate.android",
          expression: "the synthetic item {string} is selected",
          platforms: ["android"],
        },
      ],
    }),
  );
  assert.equal(prepared.status, "blocked");
  assert.equal(prepared.selectedCount, 2);
  assert.deepEqual(prepared.cases, []);
  assert.deepEqual(
    prepared.diagnostics.map(({ code }) => code),
    [
      "AMBIGUOUS_MAPPING",
      "MISSING_MAPPING",
      "AMBIGUOUS_MAPPING",
      "MISSING_MAPPING",
    ],
  );
  for (const diagnostic of prepared.diagnostics) {
    assert.ok(diagnostic.caseId);
    assert.ok(diagnostic.stepId);
    assert.ok(diagnostic.stepText);
    assert.match(diagnostic.message, /review the approved mappings/);
  }
  assert.deepEqual(prepared.diagnostics[0].mappingIds, [
    "synthetic.select.android",
    "duplicate.android",
  ]);
});

test("S03 resolves Android/iOS variants explicitly, never passes unsupported mappings", () => {
  const ios = prepareScenarios(fixture({ platform: "ios" }));
  assert.equal(ios.status, "ready");
  assert.equal(ios.cases[0].steps[1].mappingId, "synthetic.select.ios");
  const unsupported = prepareScenarios(
    fixture({
      platform: "ios",
      mappings: fixture().mappings.filter(
        ({ id }) => id !== "synthetic.select.ios",
      ),
    }),
  );
  assert.equal(unsupported.status, "blocked");
  assert.deepEqual(unsupported.cases, []);
  assert.equal(unsupported.diagnostics[0].code, "UNSUPPORTED_PLATFORM");
  assert.deepEqual(unsupported.diagnostics[0].mappingIds, [
    "synthetic.select.android",
  ]);
});

test("S04 synthetic outcome assertion fails for a wrong business result even when open", () => {
  const prepared = prepareScenarios(fixture());
  assert.equal(prepared.status, "ready");
  const outcome = prepared.cases[0].pickle.steps.at(-1)!;
  assert.equal(outcome.text, 'the synthetic result should be "accepted"');
  assert.equal(prepared.cases[0].steps.at(-1)?.mappingId, "synthetic.outcome");
  const expression = new CucumberExpression(
    fixture().mappings.find(({ id }) => id === "synthetic.outcome")!.expression,
    new ParameterTypeRegistry(),
  );
  const expected: unknown = expression.match(outcome.text)![0].getValue(null);

  // Disclosed page double and test-owned step assertion; no mobile execution.
  const pageDouble = { isOpen: true, businessResult: "rejected" };
  const thenResultShouldBeAccepted = () => {
    assert.equal(
      pageDouble.businessResult,
      expected,
      `Synthetic business result must be ${String(expected)}`,
    );
  };
  assert.equal(pageDouble.isOpen, true);
  assert.throws(
    thenResultShouldBeAccepted,
    /Synthetic business result must be accepted/,
  );
  pageDouble.businessResult = "accepted";
  assert.doesNotThrow(thenResultShouldBeAccepted);
});

test("S05 zero matching scenarios is not-run, not a passing empty suite", () => {
  const prepared = prepareScenarios(fixture({ tagExpression: "@not-present" }));
  assert.equal(prepared.status, "not-run");
  assert.equal(prepared.selectedCount, 0);
  assert.deepEqual(prepared.cases, []);
  assert.deepEqual(prepared.diagnostics, []);
});

test("S05 ignores unmapped excluded rows but blocks them when selected", () => {
  const input = fixture({
    source: {
      ...fixture().source,
      text: source.replace(
        "| gamma | held    |",
        "| gamma | $(not executable) |",
      ),
    },
    mappings: [
      ...fixture().mappings.filter(({ id }) => id !== "synthetic.outcome"),
      ...["accepted", "rejected"].map((outcome) => ({
        id: `synthetic.outcome.${outcome}`,
        expression: `the synthetic result should be "${outcome}"`,
        platforms: ["android" as const, "ios" as const],
      })),
    ],
  });
  assert.equal(prepareScenarios(input).status, "ready");
  const excluded = prepareScenarios({ ...input, tagExpression: "@excluded" });
  assert.equal(excluded.status, "blocked");
  assert.equal(excluded.diagnostics[0].code, "MISSING_MAPPING");
});

test("S06 arbitrary instruction text is never evaluated or dynamically loaded", () => {
  const instruction =
    'globalThis.__rrdmobileExecuted = true; require("node:child_process").execSync("false")';
  const prepared = prepareScenarios(
    fixture({
      tagExpression: "",
      source: {
        ...fixture().source,
        text: `Feature: Untrusted text
  Scenario: Instruction
    When ${instruction}
`,
      },
    }),
  );
  assert.equal(prepared.status, "blocked");
  assert.equal(prepared.diagnostics[0].code, "MISSING_MAPPING");
  assert.equal(prepared.diagnostics[0].stepText, instruction);
  assert.equal(Object.hasOwn(globalThis, "__rrdmobileExecuted"), false);
  assert.deepEqual(prepared.cases, []);
});

test("S02 fails closed on malformed feature, selection, mappings and empty scenarios", () => {
  const input = fixture();
  const cases = [
    {
      input: { ...input, tagExpression: "@agreed and (" },
      code: "INVALID_SELECTION",
    },
    {
      input: {
        ...input,
        source: {
          ...input.source,
          text: "Scenario: missing feature\n  Given invalid",
        },
      },
      code: "INVALID_FEATURE",
    },
    {
      input: {
        ...input,
        source: { ...input.source, text: "Feature: empty\n  Scenario: empty" },
        tagExpression: "",
      },
      code: "EMPTY_SCENARIO",
    },
    {
      input: { ...input, mappings: [input.mappings[0], input.mappings[0]] },
      code: "INVALID_MAPPING",
    },
    {
      input: {
        ...input,
        mappings: [
          { ...input.mappings[0], expression: "unknown {notRegistered}" },
        ],
      },
      code: "INVALID_MAPPING",
    },
    {
      input: {
        ...input,
        mappings: [{ ...input.mappings[0], platforms: [] }],
      },
      code: "INVALID_MAPPING",
    },
    {
      input: { ...input, mappingRevision: "" },
      code: "INVALID_INPUT",
    },
    {
      input: { ...input, source: { ...input.source, revision: "" } },
      code: "INVALID_INPUT",
    },
  ];
  for (const entry of cases) {
    const prepared = prepareScenarios(entry.input);
    assert.equal(prepared.status, "blocked", entry.code);
    assert.equal(prepared.diagnostics[0].code, entry.code);
    assert.deepEqual(prepared.cases, []);
  }
});

test("S02 no valid case is released when another selected scenario is unmapped", () => {
  const prepared = prepareScenarios(
    fixture({
      source: {
        ...fixture().source,
        text: `${source}
  @agreed
  Scenario: Needs review
    When the customer requests behavior not yet implemented
`,
      },
    }),
  );
  assert.equal(prepared.status, "blocked");
  assert.equal(prepared.selectedCount, 3);
  assert.deepEqual(prepared.cases, []);
  assert.equal(prepared.diagnostics.length, 1);
  assert.equal(prepared.diagnostics[0].code, "MISSING_MAPPING");
  assert.match(prepared.diagnostics[0].message, /Needs review/);
});

test("Cucumber preserves rule backgrounds, inherited tags, doc strings and data tables", () => {
  const text = `@inherited
Feature: Compiler behavior
  Rule: Reviewed rule
    Background:
      Given the synthetic account is open
    @selected
    Scenario: Structured arguments
      When the synthetic item "table" is selected
        | key | value |
        | a   | b     |
      Then the synthetic result should be "accepted"
        """
        opaque text, not executable
        """
`;
  const prepared = prepareScenarios(
    fixture({
      source: { ...fixture().source, text },
      tagExpression: "@inherited and @selected",
    }),
  );
  assert.equal(prepared.status, "ready");
  const steps = prepared.cases[0].pickle.steps;
  assert.equal(steps.length, 3);
  assert.equal(steps[1].argument?.dataTable?.rows[1].cells[1].value, "b");
  assert.equal(
    steps[2].argument?.docString?.content,
    "opaque text, not executable",
  );
});
