import fc from "fast-check";
import { createSeededRandom } from "../../../src/config/seeded-random";
import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import { createThresholdSearch } from "../../../src/engine/threshold-search";
import { validateSearchSettings } from "../../../src/engine/validate-search-settings";
import { checkThat } from "./check-that";
import type { SpecOnlyUniversalCheck } from "./check-types";

type SettingsField = keyof ThresholdSearchSettings;

/** One way to break one rule of R2.3 to R2.9, and the field the error must name. */
interface Mutation {
  readonly rule: string;
  readonly description: string;
  readonly field: SettingsField;
  /** The broken settings, or undefined when this mutation cannot apply to `settings`. */
  mutate(
    settings: ThresholdSearchSettings,
  ): ThresholdSearchSettings | undefined;
}

const set =
  (
    field: SettingsField,
    value: (settings: ThresholdSearchSettings) => number,
  ) =>
  (settings: ThresholdSearchSettings): ThresholdSearchSettings => ({
    ...settings,
    [field]: value(settings),
  });

const integerFields = [
  "downwardStepDb",
  "upwardStepDb",
  "startingLevelDb",
  "floorDb",
  "capRelativeToAnchorDb",
  "inconsistentCatchMarginDb",
] as const satisfies readonly SettingsField[];

const fractionFields = [
  "noSoundTrialShareMinFraction",
  "noSoundTrialShareMaxFraction",
  "noSoundTrialProbabilityFraction",
  "falseAlarmRateUnreliableAboveFraction",
  "thresholdCatchShareMinFraction",
] as const satisfies readonly SettingsField[];

const countFields = [
  "trialLimitPerEarPerRoomCount",
  "thresholdCatchesMinCount",
  "floorCatchesForBetterThanFloorCount",
  "capMissesForWorseThanCapCount",
] as const satisfies readonly SettingsField[];

/**
 * A share that no room shorter than 10 000 trials can hit exactly: 3137/10 000 is in lowest
 * terms. With the minimum, the maximum and the probability all set to it, no room length has a
 * fitting number of no-sound trials (R2.9).
 */
const unreachableShareFraction = 0.3137;

/**
 * Mutations that each break one rule. A mutation can also break a later rule, for example a
 * floor that is not an integer is also off the grid. Validation checks the rules in order, so
 * the error still names the field of the rule that was broken first.
 */
const mutations: readonly Mutation[] = [
  ...integerFields.map((field): Mutation => ({
    rule: "R2.3",
    description: `${field} not an integer`,
    field,
    mutate: set(field, (settings) => settings[field] + 0.5),
  })),
  {
    rule: "R2.4",
    description: "upwardStepDb not positive",
    field: "upwardStepDb",
    mutate: set("upwardStepDb", () => 0),
  },
  {
    rule: "R2.4",
    description: "downwardStepDb negative",
    field: "downwardStepDb",
    mutate: set("downwardStepDb", (settings) => -settings.downwardStepDb),
  },
  {
    rule: "R2.4",
    description: "downwardStepDb not a whole multiple of upwardStepDb",
    field: "downwardStepDb",
    mutate: set("upwardStepDb", (settings) => settings.downwardStepDb + 1),
  },
  {
    rule: "R2.5",
    description: "floorDb not below capRelativeToAnchorDb",
    field: "floorDb",
    mutate: set("floorDb", (settings) => settings.capRelativeToAnchorDb),
  },
  {
    rule: "R2.5",
    description: "startingLevelDb above the cap",
    field: "startingLevelDb",
    mutate: set(
      "startingLevelDb",
      (settings) => settings.capRelativeToAnchorDb + settings.upwardStepDb,
    ),
  },
  {
    rule: "R2.5",
    description: "floorDb off the level grid",
    field: "floorDb",
    // With a 1 dB upward step every integer is on the grid.
    mutate: (settings) =>
      settings.upwardStepDb > 1 && settings.floorDb < settings.startingLevelDb
        ? { ...settings, floorDb: settings.floorDb + 1 }
        : undefined,
  },
  {
    rule: "R2.5",
    description: "capRelativeToAnchorDb off the level grid",
    field: "capRelativeToAnchorDb",
    mutate: (settings) =>
      settings.upwardStepDb > 1 &&
      settings.capRelativeToAnchorDb > settings.startingLevelDb
        ? {
            ...settings,
            capRelativeToAnchorDb: settings.capRelativeToAnchorDb - 1,
          }
        : undefined,
  },
  {
    rule: "R2.6",
    description: "gapBetweenTrialsMinMs not positive",
    field: "gapBetweenTrialsMinMs",
    mutate: set("gapBetweenTrialsMinMs", () => 0),
  },
  {
    rule: "R2.6",
    description: "gapBetweenTrialsMinMs above gapBetweenTrialsMaxMs",
    field: "gapBetweenTrialsMinMs",
    mutate: set(
      "gapBetweenTrialsMinMs",
      (settings) => settings.gapBetweenTrialsMaxMs + 1,
    ),
  },
  {
    rule: "R2.6",
    description: "gapBetweenTrialsMaxMs not an integer",
    field: "gapBetweenTrialsMaxMs",
    mutate: set(
      "gapBetweenTrialsMaxMs",
      (settings) => settings.gapBetweenTrialsMaxMs + 0.5,
    ),
  },
  ...fractionFields.flatMap((field): Mutation[] => [
    {
      rule: "R2.7",
      description: `${field} above 1`,
      field,
      mutate: set(field, () => 1.5),
    },
    {
      rule: "R2.7",
      description: `${field} below 0`,
      field,
      mutate: set(field, () => -0.25),
    },
  ]),
  {
    rule: "R2.7",
    description:
      "noSoundTrialShareMinFraction above noSoundTrialShareMaxFraction",
    field: "noSoundTrialShareMinFraction",
    mutate: set(
      "noSoundTrialShareMinFraction",
      (settings) => (settings.noSoundTrialShareMaxFraction + 1) / 2,
    ),
  },
  {
    rule: "R2.7",
    description: "noSoundTrialProbabilityFraction above the share range",
    field: "noSoundTrialProbabilityFraction",
    mutate: set(
      "noSoundTrialProbabilityFraction",
      (settings) => (settings.noSoundTrialShareMaxFraction + 1) / 2,
    ),
  },
  {
    rule: "R2.7",
    description: "noSoundTrialProbabilityFraction below the share range",
    field: "noSoundTrialProbabilityFraction",
    mutate: (settings) =>
      settings.noSoundTrialShareMinFraction > 0
        ? {
            ...settings,
            noSoundTrialProbabilityFraction:
              settings.noSoundTrialShareMinFraction / 2,
          }
        : undefined,
  },
  ...countFields.flatMap((field): Mutation[] => [
    {
      rule: "R2.8",
      description: `${field} zero`,
      field,
      mutate: set(field, () => 0),
    },
    {
      rule: "R2.8",
      description: `${field} not an integer`,
      field,
      mutate: set(field, (settings) => settings[field] + 0.5),
    },
  ]),
  {
    rule: "R2.8",
    description: "inconsistentCatchMarginDb not positive",
    field: "inconsistentCatchMarginDb",
    mutate: set("inconsistentCatchMarginDb", () => 0),
  },
  {
    rule: "R2.9",
    description: "a share range that no room length can reach",
    field: "noSoundTrialShareMinFraction",
    mutate: (settings) => ({
      ...settings,
      noSoundTrialShareMinFraction: unreachableShareFraction,
      noSoundTrialShareMaxFraction: unreachableShareFraction,
      noSoundTrialProbabilityFraction: unreachableShareFraction,
    }),
  },
];

const settingsFields = [
  "downwardStepDb",
  "upwardStepDb",
  "startingLevelDb",
  "capRelativeToAnchorDb",
  "floorDb",
  "gapBetweenTrialsMinMs",
  "gapBetweenTrialsMaxMs",
  "noSoundTrialShareMinFraction",
  "noSoundTrialShareMaxFraction",
  "noSoundTrialProbabilityFraction",
  "falseAlarmRateUnreliableAboveFraction",
  "trialLimitPerEarPerRoomCount",
  "thresholdCatchesMinCount",
  "thresholdCatchShareMinFraction",
  "floorCatchesForBetterThanFloorCount",
  "capMissesForWorseThanCapCount",
  "inconsistentCatchMarginDb",
] as const satisfies readonly SettingsField[];

/** The error `validateSearchSettings` throws for `settings`, or undefined when it accepts them. */
function validationError(settings: ThresholdSearchSettings): unknown {
  try {
    validateSearchSettings(settings);
    return undefined;
  } catch (error) {
    return error;
  }
}

/**
 * CP13. Settings validation (Universal; R2). Every settings object from the settings arbitrary is
 * accepted: validation returns a frozen copy of exactly the settings fields, and a search can be
 * created from it. For each rule of R2.3 to R2.9, a mutation of that object that breaks the rule
 * is rejected with a `RangeError` whose message names the field.
 */
export const cp13SettingsValidationCheck: SpecOnlyUniversalCheck =
  Object.freeze({
    id: "CP13",
    title: "Settings validation",
    requirements: ["R2"],
    kind: "universal",
    harnessNeutral: false,
    parameters: { numRuns: 200 },
    property: (settingsArbitrary: fc.Arbitrary<ThresholdSearchSettings>) =>
      fc.property(
        settingsArbitrary,
        fc.constantFrom(...mutations),
        (settings, mutation) => {
          const copy = validateSearchSettings(settings);
          checkThat(Object.isFrozen(copy), () => "the copy is not frozen");
          checkThat(copy !== settings, () => "validation returned its input");
          checkThat(
            JSON.stringify(Object.keys(copy).sort()) ===
              JSON.stringify([...settingsFields].sort()) &&
              settingsFields.every((field) => copy[field] === settings[field]),
            () => `the copy differs from the settings: ${JSON.stringify(copy)}`,
          );
          const step = createThresholdSearch({
            settings,
            random: createSeededRandom(0),
          }).current();
          checkThat(
            step.kind === "trial",
            () => "a new search has no first trial",
          );

          const broken = mutation.mutate(settings);
          if (broken === undefined) {
            return;
          }
          const error = validationError(broken);
          checkThat(
            error instanceof RangeError &&
              error.message.includes(mutation.field),
            () =>
              `${mutation.rule}, ${mutation.description}: expected a RangeError naming ${mutation.field}, got ${error === undefined ? "no error" : String(error)}`,
          );
        },
      ),
  });
