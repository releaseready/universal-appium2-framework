import {
  CucumberExpression,
  ParameterTypeRegistry,
} from "@cucumber/cucumber-expressions";
import { generateMessages } from "@cucumber/gherkin";
import { IdGenerator, SourceMediaType, type Pickle } from "@cucumber/messages";
import { parse } from "@cucumber/tag-expressions";

export type Platform = "android" | "ios";

// Feature-local metadata only; this is not an execution or public engine contract.
export interface ReviewedMapping {
  readonly id: string;
  readonly expression: string;
  readonly platforms: readonly Platform[];
}

export interface PreparationInput {
  readonly source: { uri: string; text: string; revision: string };
  readonly mappingRevision: string;
  readonly platform: Platform;
  readonly tagExpression: string;
  readonly mappings: readonly ReviewedMapping[];
}

export interface PreparationDiagnostic {
  readonly code:
    | "INVALID_INPUT"
    | "INVALID_SELECTION"
    | "INVALID_MAPPING"
    | "INVALID_FEATURE"
    | "EMPTY_SCENARIO"
    | "MISSING_MAPPING"
    | "AMBIGUOUS_MAPPING"
    | "UNSUPPORTED_PLATFORM";
  readonly message: string;
  readonly caseId?: string;
  readonly stepId?: string;
  readonly stepText?: string;
  readonly mappingIds?: readonly string[];
}

export interface PreparedCase {
  readonly pickle: Pickle;
  readonly steps: readonly { stepId: string; mappingId: string }[];
}

export interface Preparation {
  readonly status: "ready" | "blocked" | "not-run";
  readonly source: { uri: string; revision: string };
  readonly mappingRevision: string;
  readonly platform: Platform;
  readonly selectedCount: number;
  readonly cases: readonly PreparedCase[];
  readonly diagnostics: readonly PreparationDiagnostic[];
}

export function prepareScenarios(input: PreparationInput): Preparation {
  const diagnostics: PreparationDiagnostic[] = [];
  const result = (
    status: Preparation["status"],
    selectedCount = 0,
    cases: readonly PreparedCase[] = [],
  ): Preparation => ({
    status,
    source: { uri: input.source.uri, revision: input.source.revision },
    mappingRevision: input.mappingRevision,
    platform: input.platform,
    selectedCount,
    cases,
    diagnostics,
  });

  if (
    !input.source.uri.trim() ||
    !input.source.revision.trim() ||
    !input.mappingRevision.trim() ||
    !["android", "ios"].includes(input.platform)
  ) {
    diagnostics.push({
      code: "INVALID_INPUT",
      message:
        "A pinned source, mapping revision and Android/iOS platform are required.",
    });
    return result("blocked");
  }

  let selection: ReturnType<typeof parse>;
  try {
    selection = parse(input.tagExpression);
  } catch (error) {
    diagnostics.push({
      code: "INVALID_SELECTION",
      message: error instanceof Error ? error.message : String(error),
    });
    return result("blocked");
  }

  const registry = new ParameterTypeRegistry();
  const mappings: {
    mapping: ReviewedMapping;
    expression: CucumberExpression;
  }[] = [];
  const ids = new Set<string>();
  for (const mapping of input.mappings) {
    if (
      !mapping.id.trim() ||
      ids.has(mapping.id) ||
      !mapping.expression.trim() ||
      mapping.platforms.length === 0 ||
      mapping.platforms.some(
        (platform) => !["android", "ios"].includes(platform),
      )
    ) {
      diagnostics.push({
        code: "INVALID_MAPPING",
        message:
          "Mappings require unique IDs, an expression and explicit supported platforms.",
        mappingIds: [mapping.id],
      });
      continue;
    }
    ids.add(mapping.id);
    try {
      mappings.push({
        mapping,
        expression: new CucumberExpression(mapping.expression, registry),
      });
    } catch (error) {
      diagnostics.push({
        code: "INVALID_MAPPING",
        message: error instanceof Error ? error.message : String(error),
        mappingIds: [mapping.id],
      });
    }
  }
  if (diagnostics.length) return result("blocked");

  const envelopes = generateMessages(
    input.source.text,
    input.source.uri,
    SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN,
    {
      includeGherkinDocument: true,
      includePickles: true,
      newId: IdGenerator.incrementing(),
    },
  );
  for (const { parseError } of envelopes) {
    if (parseError) {
      diagnostics.push({
        code: "INVALID_FEATURE",
        message: parseError.message,
      });
    }
  }
  if (diagnostics.length) return result("blocked");

  const selected = envelopes.flatMap(({ pickle }) =>
    pickle && selection.evaluate(pickle.tags.map(({ name }) => name))
      ? [pickle]
      : [],
  );
  if (!selected.length) return result("not-run");

  const cases: PreparedCase[] = [];
  for (const pickle of selected) {
    const steps: { stepId: string; mappingId: string }[] = [];
    if (!pickle.steps.length) {
      diagnostics.push({
        code: "EMPTY_SCENARIO",
        message: `Selected scenario "${pickle.name}" has no reviewed steps.`,
        caseId: pickle.id,
      });
    }
    for (const step of pickle.steps) {
      const matches = mappings.filter(({ expression }) =>
        expression.match(step.text),
      );
      const supported = matches.filter(({ mapping }) =>
        mapping.platforms.includes(input.platform),
      );
      if (supported.length === 1) {
        steps.push({ stepId: step.id, mappingId: supported[0].mapping.id });
        continue;
      }
      const code = !matches.length
        ? "MISSING_MAPPING"
        : !supported.length
          ? "UNSUPPORTED_PLATFORM"
          : "AMBIGUOUS_MAPPING";
      diagnostics.push({
        code,
        message: `${code}: "${step.text}" in "${pickle.name}" for ${input.platform}; review the approved mappings before execution.`,
        caseId: pickle.id,
        stepId: step.id,
        stepText: step.text,
        mappingIds: (supported.length ? supported : matches).map(
          ({ mapping }) => mapping.id,
        ),
      });
    }
    cases.push({ pickle, steps });
  }
  // Never release a partially valid suite for scheduling.
  return diagnostics.length
    ? result("blocked", selected.length)
    : result("ready", selected.length, cases);
}
