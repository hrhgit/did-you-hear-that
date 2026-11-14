import fc from "fast-check";
import type { ThresholdSearchSettings } from "../../../src/engine/search-types";
import type { PsychometricListenerParameters } from "../../listeners/psychometric-listener";
import type { SearchUnderTest } from "../../listeners/search-under-test";
import type { StatisticalVerdict } from "./check-types";
import {
  measureListenerSet,
  summarizeListenerSet,
  type ListenerSetMeasurement,
} from "./measure-listener-set";

/**
 * Evaluates a per-listener rate property (design.md, CP2 and CP3; D19). fast-check draws
 * `setCount` parameter sets from `arbitrary` with the fixed `seed`, every set plays `roomsPerSet`
 * rooms, and the property holds when `meets` holds for every set.
 *
 * When a set does not meet it, fast-check is run again with the same seed and run count so that
 * it stops at a set that does not meet it and shrinks it. The shrunk set is the first
 * counterexample, a reproducible kind of listener rather than one unlucky room.
 */
export function evaluateListenerSets(options: {
  readonly search: SearchUnderTest;
  readonly settings: ThresholdSearchSettings;
  readonly arbitrary: fc.Arbitrary<PsychometricListenerParameters>;
  readonly seed: number;
  readonly setCount: number;
  readonly roomsPerSet: number;
  readonly meets: (measurement: ListenerSetMeasurement) => boolean;
  /**
   * The same limits with the original "within 5 dB" in place of Accurate (D42). It decides
   * nothing: the number of sets it leaves below the limits is reported beside the verdict.
   */
  readonly meetsWithinFiveDb: (measurement: ListenerSetMeasurement) => boolean;
  /** Orders sets from worst to best for the "worst set" metric. Lower is worse. */
  readonly sortKey: (measurement: ListenerSetMeasurement) => number;
  readonly limits: Readonly<Record<string, number>>;
}): StatisticalVerdict {
  const { search, settings, arbitrary, seed, setCount, roomsPerSet, meets } =
    options;
  const measure = (parameters: PsychometricListenerParameters) =>
    measureListenerSet(search, settings, parameters, roomsPerSet);

  const measurements = fc
    .sample(arbitrary, { seed, numRuns: setCount })
    .map(measure);
  const notMeeting = measurements.filter((measurement) => !meets(measurement));
  const worst = [...measurements].sort(
    (a, b) => options.sortKey(a) - options.sortKey(b),
  )[0];
  const total = (
    field:
      "accurateCount" | "flaggedCount" | "wrongCount" | "withinFiveDbCount",
  ) => measurements.reduce((sum, measurement) => sum + measurement[field], 0);
  const earCount = measurements.reduce(
    (sum, measurement) => sum + measurement.earCount,
    0,
  );

  const metrics = {
    ...options.limits,
    seed,
    setCount,
    roomsPerSet,
    earCount,
    accurateFraction: total("accurateCount") / earCount,
    flaggedFraction: total("flaggedCount") / earCount,
    wrongFraction: total("wrongCount") / earCount,
    withinFiveDbFraction: total("withinFiveDbCount") / earCount,
    withinFiveDbSetsNotMeetingLimitCount: measurements.filter(
      (measurement) => !options.meetsWithinFiveDb(measurement),
    ).length,
    unfinishedRoomCount: measurements.reduce(
      (sum, measurement) => sum + measurement.unfinishedRoomCount,
      0,
    ),
    setsNotMeetingLimitCount: notMeeting.length,
    worstSet: summarizeListenerSet(worst),
    setsNotMeetingLimit: notMeeting.map(summarizeListenerSet),
  };

  if (notMeeting.length === 0) {
    return Object.freeze({ holds: true, metrics });
  }

  const shrinking = fc.check(
    fc.property(arbitrary, (parameters) => meets(measure(parameters))),
    { seed, numRuns: setCount },
  );
  const shrunk =
    shrinking.failed && shrinking.counterexample !== null
      ? measure(shrinking.counterexample[0])
      : notMeeting[0];
  return Object.freeze({
    holds: false,
    firstCounterexample: {
      shrunk: {
        ...summarizeListenerSet(shrunk),
        wrongExamples: shrunk.wrongExamples,
      },
      firstInDrawOrder: summarizeListenerSet(notMeeting[0]),
      fastCheck: {
        seed: shrinking.seed,
        path: shrinking.counterexamplePath,
        numShrinks: shrinking.numShrinks,
      },
    },
    metrics,
  });
}
