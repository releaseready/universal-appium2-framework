import type { PreparationInput } from "../../src/scenarios/prepare.js";

export const fixtureVersion = "rrdmobile-1/offline-fixture-v1";

// Synthetic journeys and mappings, not approved customer automation.
export const source = `@mobile_scenarios
Feature: Synthetic reviewed business outcome
  Background:
    Given the synthetic account is open

  @mobile_scenarios_S01 @mobile_scenarios_S04 @mobile_scenarios_S05
  Scenario Outline: Review <item>
    When the synthetic item "<item>" is selected
    Then the synthetic result should be "<outcome>"

    @agreed
    Examples:
      | item  | outcome  |
      | alpha | accepted |
      | beta  | rejected |

    @excluded
    Examples:
      | item  | outcome |
      | gamma | held    |
`;

export function fixture(
  overrides: Partial<PreparationInput> = {},
): PreparationInput {
  return {
    source: {
      uri: "synthetic.feature",
      text: source,
      revision: fixtureVersion,
    },
    mappingRevision: fixtureVersion,
    platform: "android",
    tagExpression: "@agreed and not @excluded",
    mappings: [
      {
        id: "synthetic.open",
        expression: "the synthetic account is open",
        platforms: ["android", "ios"],
      },
      {
        id: "synthetic.select.android",
        expression: "the synthetic item {string} is selected",
        platforms: ["android"],
      },
      {
        id: "synthetic.select.ios",
        expression: "the synthetic item {string} is selected",
        platforms: ["ios"],
      },
      {
        id: "synthetic.outcome",
        expression: "the synthetic result should be {string}",
        platforms: ["android", "ios"],
      },
    ],
    ...overrides,
  };
}
