import fc from "fast-check";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { calibrationSettingTopDb } from "../../src/audio/output/calibration-setting-top";

// The arbitraries of the audible-start spec's properties (audible-start design.md, "Correctness
// properties"). Each task adds what its properties draw; this file starts with the control paths
// of CP7.

/** The latest time of a step of a control path, after the path began. */
export const controlPathSpanMs = 60_000;
/** The most steps of one control path. */
export const controlPathStepMaxCount = 40;

/**
 * Any setting a control could pass to `setCalibrationTarget`: settings on the control's grid,
 * between them and just below them, from below the bottom to above the top; any double, NaN and the infinities
 * included; and, one time in fifteen, a value that is not a number at all, as an untyped caller
 * could pass.
 */
export const calibrationTargetRequestArbitrary: fc.Arbitrary<number> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.integer({
      min: audioOutputConfig.calibrationSettingMinDb - 10,
      max: calibrationSettingTopDb() + 10,
    }),
  },
  {
    weight: 4,
    arbitrary: fc.double({
      min: audioOutputConfig.calibrationSettingMinDb - 10,
      max: calibrationSettingTopDb() + 10,
      noNaN: true,
    }),
  },
  {
    // Between grid settings, spread evenly over the step, and just below a grid setting, where
    // the rounding's tolerance decides.
    weight: 4,
    arbitrary: fc
      .tuple(
        fc.integer({
          min: audioOutputConfig.calibrationSettingMinDb - 10,
          max: calibrationSettingTopDb() + 10,
        }),
        fc.oneof(
          fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true }),
          fc.constantFrom(-1e-12, -1e-9, -1e-6),
        ),
      )
      .map(
        ([settingDb, fraction]) =>
          settingDb + fraction * audioOutputConfig.calibrationSettingStepDb,
      ),
  },
  {
    weight: 3,
    arbitrary: fc.constantFrom(
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ),
  },
  { weight: 3, arbitrary: fc.double() },
  {
    weight: 1,
    arbitrary: fc
      .constantFrom<unknown>("-20", undefined, null, {}, true)
      .map((value) => value as number),
  },
);

/** One step of a control path: what the visitor or the device does to the calibration. */
export type CalibrationControlStep =
  | {
      readonly atMs: number;
      readonly kind: "target";
      /** Passed to `setCalibrationTarget` or `setTarget` as it is, whatever it is. */
      readonly settingDb: number;
    }
  | {
      readonly atMs: number;
      readonly kind:
        | "louder"
        | "quieter"
        /** `startCalibration`, or `open` after an `activate`. */
        | "start"
        | "keep"
        | "close"
        | "resume"
        | "stopAll"
        | "hidden"
        | "interrupted"
        | "deviceChanged"
        | "pageLeft";
    };

export type CalibrationControlStepKind = CalibrationControlStep["kind"];

/** Every kind of step but `target`, with its weight against `target`'s 8. */
const otherStepWeights: Readonly<
  Record<Exclude<CalibrationControlStepKind, "target">, number>
> = Object.freeze({
  louder: 4,
  quieter: 3,
  start: 2,
  keep: 1,
  close: 1,
  resume: 2,
  stopAll: 1,
  hidden: 1,
  interrupted: 1,
  deviceChanged: 1,
  pageLeft: 1,
});

/**
 * A control path: 1 to 40 steps at times from 0 to 60 s after the path began, in the order of
 * their times (CP7, CP6). `kinds` keeps only the steps of those kinds; `target` is always kept.
 */
export function calibrationControlPathArbitrary(
  kinds: readonly Exclude<CalibrationControlStepKind, "target">[] = Object.keys(
    otherStepWeights,
  ) as Exclude<CalibrationControlStepKind, "target">[],
): fc.Arbitrary<readonly CalibrationControlStep[]> {
  const atMs = fc.integer({ min: 0, max: controlPathSpanMs });
  const step: fc.Arbitrary<CalibrationControlStep> = fc.oneof(
    {
      weight: 8,
      arbitrary: fc.record({
        atMs,
        kind: fc.constant("target" as const),
        settingDb: calibrationTargetRequestArbitrary,
      }),
    },
    ...kinds.map((kind) => ({
      weight: otherStepWeights[kind],
      arbitrary: fc.record({ atMs, kind: fc.constant(kind) }),
    })),
  );
  return (
    fc
      // `size: "max"` spreads the lengths over the whole range, not only the short paths that
      // fast-check's default size favours.
      .array(step, {
        minLength: 1,
        maxLength: controlPathStepMaxCount,
        size: "max",
      })
      .map((steps) => Object.freeze([...steps].sort((a, b) => a.atMs - b.atMs)))
  );
}
