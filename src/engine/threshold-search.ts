import type { RandomSource } from "../config/seeded-random";
import { createAdaptiveEarSearch } from "./adaptive-ear-search";
import { atMostFraction } from "./fraction-comparisons";
import { classifyResponse } from "./classify-response";
import { createEarSearch, type EarSearch } from "./ear-search";
import { finalizeEarResult } from "./finalize-ear-result";
import { createQuickEarSearch } from "./quick-ear-search";
import { createNoSoundSchedule } from "./no-sound-schedule";
import type {
  CatchGrade,
  Ear,
  HearingSearchMethod,
  NoSoundOutcome,
  NoSoundTrial,
  RoomResult,
  SearchEvidence,
  SearchStep,
  SoundOutcome,
  SoundTrial,
  ThresholdSearch,
  ThresholdSearchSettings,
  TrialRecord,
  VisitorResponse,
} from "./search-types";
import { validateSearchSettings } from "./validate-search-settings";

/** The order in which searching ears are listed for the ear draw (design.md, draw 2). */
const earOrder = ["left", "right"] as const satisfies readonly Ear[];

/**
 * Creates the threshold search for one room (design.md, "The room, step by step").
 *
 * The settings are validated and copied first, so a caller who changes their object later
 * cannot affect the room (R2.10). The first trial is made here, so `current()` never draws a
 * random number (R3.2). Random draws happen only in this function and in `respond`, in the order
 * kind (draw 1), ear (draw 2), gap (draw 3). Draw 1 is skipped when the share maximum forbids a
 * no-sound trial, and draw 2 when the trial is a no-sound trial or only one ear is searching.
 */
export function createThresholdSearch(options: {
  settings: ThresholdSearchSettings;
  random: RandomSource;
  method?: HearingSearchMethod;
}): ThresholdSearch {
  const settings = validateSearchSettings(options.settings);
  const { random } = options;
  if (
    typeof random !== "object" ||
    random === null ||
    typeof random.next !== "function"
  ) {
    throw new TypeError(
      "createThresholdSearch needs a random source with a next function.",
    );
  }

  const method = options.method ?? "staircase";
  const createSearch = {
    staircase: createEarSearch,
    quick: createQuickEarSearch,
    adaptive: createAdaptiveEarSearch,
  }[method];
  const ears: Readonly<Record<Ear, EarSearch>> = Object.freeze({
    left: createSearch("left", settings),
    right: createSearch("right", settings),
  });
  const schedule = createNoSoundSchedule(settings);
  const records: TrialRecord[] = [];
  let noSoundTrialCount = 0;
  let soundTrialCount = 0;

  // R3.6 and D11: whole milliseconds, uniform over the range, the same for every trial.
  const drawGapMs = (): number =>
    settings.gapBetweenTrialsMinMs +
    Math.floor(
      random.next() *
        (settings.gapBetweenTrialsMaxMs - settings.gapBetweenTrialsMinMs + 1),
    );

  const buildResult = (): RoomResult => {
    const falseAlarmCount = records.filter(
      (record) => record.outcome === "falseAlarm",
    ).length;
    const falseAlarmRateFraction =
      noSoundTrialCount > 0 ? falseAlarmCount / noSoundTrialCount : 0;
    const falseAlarmRateAboveLimit =
      noSoundTrialCount > 0 &&
      !atMostFraction(
        falseAlarmCount,
        noSoundTrialCount,
        settings.falseAlarmRateUnreliableAboveFraction,
      );
    const earResult = (ear: Ear) => {
      const ending = ears[ear].ending();
      if (ending === undefined) {
        throw new Error(`The ${ear} ear search has not ended.`);
      }
      return finalizeEarResult({
        ending,
        presentations: ears[ear].presentations(),
        falseAlarmRateAboveLimit,
        settings,
        method,
      });
    };
    return Object.freeze({
      left: earResult("left"),
      right: earResult("right"),
      noSoundTrialCount,
      falseAlarmCount,
      falseAlarmRateFraction,
      falseAlarmRateAboveLimit,
      trials: Object.freeze([...records]),
    });
  };

  const noSoundStep = (phase: NoSoundTrial["phase"]): SearchStep => {
    const trial: NoSoundTrial = Object.freeze({
      kind: "noSound",
      trialNumber: records.length + 1,
      phase,
      gapBeforeMs: drawGapMs(),
    });
    return Object.freeze({ kind: "trial", trial });
  };

  const makeNextStep = (): SearchStep => {
    const searching = earOrder
      .map((ear) => ears[ear])
      .filter((earSearch) => earSearch.isSearching());

    if (searching.length > 0) {
      // Search_Phase.
      const remainingSoundLowerBound = searching.reduce(
        (sum, earSearch) => sum + earSearch.remainingPresentationsLowerBound(),
        0,
      );
      let isNoSound = false;
      if (
        schedule.mayAddNoSoundTrial({
          noSound: noSoundTrialCount,
          sound: soundTrialCount,
          remainingSoundLowerBound,
        })
      ) {
        isNoSound = random.next() < settings.noSoundTrialProbabilityFraction; // draw 1
      }
      if (isNoSound) {
        return noSoundStep("search");
      }
      const earSearch =
        searching.length === 1
          ? searching[0]
          : searching[Math.floor(random.next() * searching.length)]; // draw 2
      const { levelDb, direction } = earSearch.next();
      const trial: SoundTrial = Object.freeze({
        kind: "sound",
        trialNumber: records.length + 1,
        ear: earSearch.ear,
        levelDb,
        direction,
        gapBeforeMs: drawGapMs(), // draw 3
      });
      return Object.freeze({ kind: "trial", trial });
    }

    if (
      schedule.needsClosingTrial({
        noSound: noSoundTrialCount,
        sound: soundTrialCount,
      })
    ) {
      // Closing_Phase (D8).
      return noSoundStep("closing");
    }

    return Object.freeze({ kind: "finished", result: buildResult() });
  };

  let step = makeNextStep();

  return Object.freeze({
    current: (): SearchStep => step,

    earEstimate: (ear: Ear): number | null => {
      if (step.kind === "finished") {
        const result = step.result[ear];
        return result.state === "found" ? result.thresholdDb : null;
      }
      const ending = ears[ear].ending();
      return ending?.kind === "found" ? ending.thresholdDb : null;
    },

    cutOff: () => {
      if (step.kind === "finished") {
        return step;
      }
      for (const earSearch of Object.values(ears)) {
        earSearch.cutOff();
      }
      const finished = Object.freeze({
        kind: "finished" as const,
        result: buildResult(),
      });
      step = finished;
      return finished;
    },

    respond: (
      response: VisitorResponse,
      grade?: CatchGrade,
      evidence?: SearchEvidence,
    ): SearchStep => {
      if (step.kind === "finished") {
        throw new Error("The room has finished, so no response is expected.");
      }
      const { trial } = step;
      // Throws a TypeError for an invalid response before anything changes (R4.7).
      // classifyResponse returns a sound outcome for a sound trial and a no-sound outcome
      // otherwise, so the casts only narrow its union return type.
      const outcome = classifyResponse(trial, response);
      if (trial.kind === "sound") {
        const soundOutcome = outcome as SoundOutcome;
        records.push(Object.freeze({ trial, response, outcome: soundOutcome }));
        ears[trial.ear].record(soundOutcome, grade, evidence);
        soundTrialCount += 1;
      } else {
        const noSoundOutcome = outcome as NoSoundOutcome;
        records.push(
          Object.freeze({ trial, response, outcome: noSoundOutcome }),
        );
        noSoundTrialCount += 1;
      }
      step = makeNextStep();
      return step;
    },
  });
}
