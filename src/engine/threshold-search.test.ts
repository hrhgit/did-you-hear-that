import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { createSeededRandom, type RandomSource } from "../config/seeded-random";
import type {
  Ear,
  SearchStep,
  SoundOutcome,
  ThresholdSearch,
  ThresholdSearchSettings,
  Trial,
  VisitorResponse,
} from "./search-types";
import { createThresholdSearch } from "./threshold-search";

/** The largest value sfc32 can return: (2^32 − 1) / 2^32. */
const largestDraw = (2 ** 32 - 1) / 2 ** 32;

interface StubRandom extends RandomSource {
  /** Values returned first, in order. */
  readonly queue: number[];
  /** Returned once the queue is empty. */
  fallback: number;
  /** How many times next() was called. */
  calls: number;
}

/** A random source that returns scripted values and counts its calls. */
function createStubRandom(fallback: number, queue: number[] = []): StubRandom {
  const stub: StubRandom = {
    seed: 0,
    queue,
    fallback,
    calls: 0,
    next: () => {
      stub.calls += 1;
      const value = stub.queue.shift();
      return value ?? stub.fallback;
    },
  };
  return stub;
}

function create(
  random: RandomSource,
  settings: ThresholdSearchSettings = hearingMethodConfig,
): ThresholdSearch {
  return createThresholdSearch({ settings, random });
}

function trialOf(step: SearchStep): Trial {
  if (step.kind !== "trial") {
    throw new Error("Expected a trial, but the room has finished.");
  }
  return step.trial;
}

type Responder = (trial: Trial) => VisitorResponse;

/** Answers every trial until the room finishes and returns every step, the first included. */
function runRoom(search: ThresholdSearch, responder: Responder): SearchStep[] {
  const steps = [search.current()];
  let step = search.current();
  while (step.kind === "trial") {
    step = search.respond(responder(step.trial));
    steps.push(step);
  }
  return steps;
}

const neverAnswers: Responder = () => "none";

/** Catches every sound at or above the threshold on its own side and never false-alarms. */
function stepListener(thresholdDb: number): Responder {
  return (trial) =>
    trial.kind === "sound" && trial.levelDb >= thresholdDb ? trial.ear : "none";
}

/** Answers each ear's presentations from its own scripted outcome list. */
function scriptedEars(
  outcomes: Readonly<Record<Ear, readonly SoundOutcome[]>>,
  onNoSound: (noSoundIndex: number) => VisitorResponse,
): Responder {
  const presented: Record<Ear, number> = { left: 0, right: 0 };
  let noSoundIndex = 0;
  return (trial) => {
    if (trial.kind === "noSound") {
      const response = onNoSound(noSoundIndex);
      noSoundIndex += 1;
      return response;
    }
    const outcome = outcomes[trial.ear][presented[trial.ear]];
    presented[trial.ear] += 1;
    if (outcome === "caught") {
      return trial.ear;
    }
    if (outcome === "wrongSide") {
      return trial.ear === "left" ? "right" : "left";
    }
    return "none";
  };
}

const C: SoundOutcome = "caught";
const M: SoundOutcome = "missed";
/** Trace F of the worked examples: found at −40 after 19 presentations, no inconsistent catch. */
const traceF = [C, C, M, C, M, M, M, C, M, M, M, C, M, M, M, C, C, M, C];

describe("createThresholdSearch", () => {
  describe("creation and current()", () => {
    it("makes the first trial available after creation, without a response", () => {
      const random = createStubRandom(0.5);
      const search = create(random);
      expect(search.current()).toEqual({
        kind: "trial",
        trial: {
          kind: "sound",
          trialNumber: 1,
          ear: "right",
          levelDb: -25,
          direction: "first",
          gapBeforeMs: 1500 + Math.floor(0.5 * 2501),
        },
      });
      expect(random.calls).toBe(3);
    });

    it("returns the same trial from repeated current() calls and draws nothing", () => {
      const random = createStubRandom(0.5);
      const search = create(random);
      const callsAfterCreation = random.calls;
      const first = search.current();
      for (let index = 0; index < 5; index += 1) {
        expect(search.current()).toBe(first);
      }
      expect(random.calls).toBe(callsAfterCreation);
    });

    it("throws a TypeError for a random source without a next function", () => {
      expect(() =>
        createThresholdSearch({
          settings: hearingMethodConfig,
          random: { seed: 1 } as unknown as RandomSource,
        }),
      ).toThrow(TypeError);
    });

    it("throws a RangeError for invalid settings", () => {
      expect(() =>
        create(createStubRandom(0.5), {
          ...hearingMethodConfig,
          floorDb: -62,
        }),
      ).toThrow(RangeError);
    });
  });

  it("numbers the trials of a room from 1 in order", () => {
    const steps = runRoom(create(createSeededRandom(7)), stepListener(-52));
    const numbers = steps
      .filter((step) => step.kind === "trial")
      .map((step) => trialOf(step).trialNumber);
    expect(numbers).toEqual(numbers.map((_, index) => index + 1));
    expect(numbers.length).toBeGreaterThan(0);
  });

  describe("draw 1: the kind of a search trial", () => {
    it("makes a no-sound trial for a draw below 0.2, then draws only the gap", () => {
      const random = createStubRandom(0.9, [0.19999, 0.3]);
      const trial = trialOf(create(random).current());
      expect(trial).toEqual({
        kind: "noSound",
        trialNumber: 1,
        phase: "search",
        gapBeforeMs: 1500 + Math.floor(0.3 * 2501),
      });
      expect(random.calls).toBe(2);
    });

    it("makes a sound trial for a draw at 0.2", () => {
      const random = createStubRandom(0.9, [0.2, 0.3, 0]);
      const trial = trialOf(create(random).current());
      expect(trial).toMatchObject({ kind: "sound", ear: "left" });
      expect(random.calls).toBe(3);
    });

    it("makes no kind draw when the share maximum forbids a no-sound trial", () => {
      // The first trial is a no-sound trial. A second one before any sound would put 2 of the
      // 6 trials of the shortest room at no sound, above 0.25.
      const random = createStubRandom(0.1);
      const search = create(random);
      expect(trialOf(search.current()).kind).toBe("noSound");
      const callsBefore = random.calls;
      const trial = trialOf(search.respond("none"));
      expect(trial.kind).toBe("sound");
      // Only the ear draw and the gap draw.
      expect(random.calls - callsBefore).toBe(2);
    });
  });

  describe("draw 2: the ear of a sound trial", () => {
    it("picks left for a draw below 0.5", () => {
      const random = createStubRandom(0.9, [0.5, 0.49999, 0]);
      expect(trialOf(create(random).current())).toMatchObject({
        kind: "sound",
        ear: "left",
      });
    });

    it("picks right for a draw at 0.5", () => {
      const random = createStubRandom(0.9, [0.5, 0.5, 0]);
      expect(trialOf(create(random).current())).toMatchObject({
        kind: "sound",
        ear: "right",
      });
    });

    it("skips the ear draw when only one ear is searching", () => {
      // 0.4 makes every trial a sound trial for the left ear. Trace B ends it after 10.
      const random = createStubRandom(0.4);
      const search = create(random);
      let step = search.current();
      for (let index = 0; index < 10; index += 1) {
        expect(trialOf(step)).toMatchObject({ kind: "sound", ear: "left" });
        step = search.respond("none");
      }
      // The next response finishes nothing and makes the next trial: draw 1, then the gap.
      // An ear draw would take the 0 meant for the gap, and the gap would come from 0.9.
      random.fallback = 0.9;
      random.queue.push(0.5, 0);
      const callsBefore = random.calls;
      expect(trialOf(step)).toMatchObject({ kind: "sound", ear: "right" });
      const next = trialOf(search.respond("none"));
      expect(next).toMatchObject({
        kind: "sound",
        ear: "right",
        gapBeforeMs: 1500,
      });
      expect(random.calls - callsBefore).toBe(2);
    });
  });

  describe("draw 3: the gap", () => {
    it("gives the minimum gap for a draw of 0", () => {
      const random = createStubRandom(0.9, [0.5, 0.3, 0]);
      expect(trialOf(create(random).current()).gapBeforeMs).toBe(1500);
    });

    it("gives the maximum gap for the largest possible draw", () => {
      const random = createStubRandom(0.9, [0.5, 0.3, largestDraw]);
      expect(trialOf(create(random).current()).gapBeforeMs).toBe(4000);
    });
  });

  it("adds closing trials until the minimum share is reached when draws never make a no-sound trial", () => {
    // 0.9 makes every search trial a sound trial. Never answering ends each ear after 10, and
    // 20 sound trials need 4 no-sound trials: 3 of 23 is below 0.15 and 4 of 24 is not.
    const random = createStubRandom(0.9);
    const search = create(random);
    const steps = runRoom(search, neverAnswers);
    const trials = steps.slice(0, -1).map(trialOf);
    expect(trials).toHaveLength(24);
    expect(trials.slice(0, 20).every((trial) => trial.kind === "sound")).toBe(
      true,
    );
    expect(trials.slice(20)).toEqual(
      [21, 22, 23, 24].map((trialNumber) => ({
        kind: "noSound",
        trialNumber,
        phase: "closing",
        gapBeforeMs: 1500 + Math.floor(0.9 * 2501),
      })),
    );
    const finished = steps.at(-1);
    expect(finished?.kind).toBe("finished");
    if (finished?.kind === "finished") {
      expect(finished.result.noSoundTrialCount).toBe(4);
      expect(finished.result.left.state).toBe("worseThanCap");
      expect(finished.result.right.state).toBe("worseThanCap");
    }
  });

  describe("the false alarm rule", () => {
    /**
     * Both ears follow trace F (38 sound trials, both found at −40). Every search trial is a
     * sound trial for the left ear until it ends, then for the right ear. Once 30 sound trials
     * have been made, the next 10 trials are no-sound trials. `falseAlarms` of them are answered.
     */
    function roomWithFalseAlarms(falseAlarms: number) {
      const random = createStubRandom(0.4);
      const search = create(random);
      const responder = scriptedEars(
        { left: traceF, right: traceF },
        (noSoundIndex) => (noSoundIndex < falseAlarms ? "left" : "none"),
      );
      let soundTrials = 0;
      let noSoundTrials = 0;
      let step = search.current();
      while (step.kind === "trial") {
        if (step.trial.kind === "sound") {
          soundTrials += 1;
        } else {
          noSoundTrials += 1;
        }
        // Set the value for the draws of the next trial.
        random.fallback = soundTrials >= 30 && noSoundTrials < 10 ? 0.1 : 0.4;
        step = search.respond(responder(step.trial));
      }
      return step.result;
    }

    it("keeps both ears as they ended when the rate is exactly at the limit (3 of 10)", () => {
      const result = roomWithFalseAlarms(3);
      expect(result.noSoundTrialCount).toBe(10);
      expect(result.falseAlarmCount).toBe(3);
      expect(result.falseAlarmRateFraction).toBeCloseTo(0.3, 12);
      expect(result.falseAlarmRateAboveLimit).toBe(false);
      expect(result.left).toMatchObject({ state: "found", thresholdDb: -40 });
      expect(result.right).toMatchObject({ state: "found", thresholdDb: -40 });
    });

    it("makes both ears unreliable when the rate is above the limit (4 of 10)", () => {
      const result = roomWithFalseAlarms(4);
      expect(result.noSoundTrialCount).toBe(10);
      expect(result.falseAlarmCount).toBe(4);
      expect(result.falseAlarmRateFraction).toBeCloseTo(0.4, 12);
      expect(result.falseAlarmRateAboveLimit).toBe(true);
      for (const ear of ["left", "right"] as const) {
        expect(result[ear]).toEqual({
          state: "unreliable",
          reasons: ["falseAlarmRate"],
          presentationCount: 19,
          catchCount: 8,
          wrongSideCount: 0,
          missCount: 11,
        });
      }
    });
  });

  describe("respond", () => {
    it("throws a TypeError for an invalid response and changes nothing", () => {
      const random = createStubRandom(0.3);
      const search = create(random);
      const twin = create(createStubRandom(0.3));
      search.respond("left");
      twin.respond("left");
      const before = search.current();
      const callsBefore = random.calls;
      for (const invalid of ["LEFT", "", undefined, 0, null] as unknown[]) {
        expect(() => search.respond(invalid as VisitorResponse)).toThrow(
          TypeError,
        );
      }
      expect(search.current()).toBe(before);
      expect(random.calls).toBe(callsBefore);
      expect(runRoom(search, stepListener(-52))).toEqual(
        runRoom(twin, stepListener(-52)),
      );
    });

    it("returns the result from the response that finished the room and from current()", () => {
      const search = create(createSeededRandom(11));
      let step = search.current();
      let last: SearchStep = step;
      while (step.kind === "trial") {
        last = search.respond(neverAnswers(step.trial));
        step = last;
      }
      expect(last.kind).toBe("finished");
      expect(search.current()).toBe(last);
    });

    it("throws an Error after the room has finished and changes nothing", () => {
      const random = createSeededRandom(12);
      const search = create(random);
      runRoom(search, neverAnswers);
      const finished = search.current();
      expect(() => search.respond("none")).toThrow(Error);
      expect(() => search.respond("left")).toThrow(Error);
      expect(search.current()).toBe(finished);
    });

    it("records every trial with its response and outcome, in order", () => {
      const search = create(createSeededRandom(13));
      const steps = runRoom(search, stepListener(-52));
      const finished = steps.at(-1);
      if (finished?.kind !== "finished") {
        throw new Error("The room did not finish.");
      }
      const trials = steps.slice(0, -1).map(trialOf);
      expect(finished.result.trials.map((record) => record.trial)).toEqual(
        trials,
      );
      for (const record of finished.result.trials) {
        const expected = stepListener(-52)(record.trial);
        expect(record.response).toBe(expected);
        expect(record.outcome).toBe(
          record.trial.kind === "noSound"
            ? "noResponse"
            : expected === "none"
              ? "missed"
              : "caught",
        );
      }
    });
  });

  it("is unaffected by changes to the settings object after creation", () => {
    const settings: {
      -readonly [
        Field in keyof ThresholdSearchSettings
      ]: ThresholdSearchSettings[Field];
    } = { ...hearingMethodConfig };
    const search = create(createSeededRandom(21), settings);
    const twin = create(createSeededRandom(21), { ...hearingMethodConfig });
    settings.startingLevelDb = -30;
    settings.upwardStepDb = 10;
    settings.trialLimitPerEarPerRoomCount = 3;
    settings.noSoundTrialProbabilityFraction = 0.25;
    settings.gapBetweenTrialsMaxMs = 1500;
    expect(runRoom(search, stepListener(-52))).toEqual(
      runRoom(twin, stepListener(-52)),
    );
  });

  it("requests equal trials and returns equal results for the same seed and responses", () => {
    for (const seed of [1, 2, 3]) {
      const first = runRoom(
        create(createSeededRandom(seed)),
        stepListener(-37),
      );
      const second = runRoom(
        create(createSeededRandom(seed)),
        stepListener(-37),
      );
      expect(first).toEqual(second);
    }
  });

  it("returns frozen steps, trials, records and results", () => {
    const steps = runRoom(create(createSeededRandom(31)), (trial) =>
      trial.kind === "noSound" ? "left" : trial.ear,
    );
    for (const step of steps) {
      expect(Object.isFrozen(step)).toBe(true);
    }
    for (const step of steps.slice(0, -1)) {
      expect(Object.isFrozen(trialOf(step))).toBe(true);
    }
    const finished = steps.at(-1);
    if (finished?.kind !== "finished") {
      throw new Error("The room did not finish.");
    }
    const { result } = finished;
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.trials)).toBe(true);
    for (const record of result.trials) {
      expect(Object.isFrozen(record)).toBe(true);
      expect(Object.isFrozen(record.trial)).toBe(true);
    }
    for (const ear of ["left", "right"] as const) {
      const earResult = result[ear];
      expect(Object.isFrozen(earResult)).toBe(true);
      expect(earResult.state).toBe("unreliable");
      if (earResult.state === "unreliable") {
        expect(Object.isFrozen(earResult.reasons)).toBe(true);
      }
    }
    expect(() => {
      (result as { noSoundTrialCount: number }).noSoundTrialCount = 0;
    }).toThrow(TypeError);
  });
});
