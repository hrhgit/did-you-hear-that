import { describe, expect, it } from "vitest";
import { hearingMethodConfig as shippedHearingMethodConfig } from "../config/hearing-method-config";
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

/**
 * The shipped settings with the starting level these examples were written for, 25 dB below the
 * anchor. The shipped start moved to 10 dB below on 2026-11-16 (audible-start, light plan); the
 * engine's rules do not depend on where it starts, and its examples keep their levels.
 */
const hearingMethodConfig = Object.freeze({
  ...shippedHearingMethodConfig,
  startingLevelDb: -25,
});

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
          gapBeforeMs: 800 + Math.floor(0.5 * 801),
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
        gapBeforeMs: 800 + Math.floor(0.3 * 801),
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
      // 0.4 makes every trial a sound trial for the left ear. Trace B ends it after 8.
      const random = createStubRandom(0.4);
      const search = create(random);
      let step = search.current();
      for (let index = 0; index < 8; index += 1) {
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
        gapBeforeMs: 800,
      });
      expect(random.calls - callsBefore).toBe(2);
    });
  });

  describe("draw 3: the gap", () => {
    it("gives the minimum gap for a draw of 0", () => {
      const random = createStubRandom(0.9, [0.5, 0.3, 0]);
      expect(trialOf(create(random).current()).gapBeforeMs).toBe(800);
    });

    it("gives the maximum gap for the largest possible draw", () => {
      const random = createStubRandom(0.9, [0.5, 0.3, largestDraw]);
      expect(trialOf(create(random).current()).gapBeforeMs).toBe(1600);
    });
  });

  it("adds closing trials until the minimum share is reached when draws never make a no-sound trial", () => {
    // 0.9 makes every search trial a sound trial. Never answering ends each ear after 8, and
    // 16 sound trials need 3 no-sound trials: 2 of 18 is below 0.15 and 3 of 19 is not.
    const random = createStubRandom(0.9);
    const search = create(random);
    const steps = runRoom(search, neverAnswers);
    const trials = steps.slice(0, -1).map(trialOf);
    expect(trials).toHaveLength(19);
    expect(trials.slice(0, 16).every((trial) => trial.kind === "sound")).toBe(
      true,
    );
    expect(trials.slice(16)).toEqual(
      [17, 18, 19].map((trialNumber) => ({
        kind: "noSound",
        trialNumber,
        phase: "closing",
        gapBeforeMs: 800 + Math.floor(0.9 * 801),
      })),
    );
    const finished = steps.at(-1);
    expect(finished?.kind).toBe("finished");
    if (finished?.kind === "finished") {
      expect(finished.result.noSoundTrialCount).toBe(3);
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

  describe("cutOff", () => {
    it("finishes the room at once, with both open ears unreliable for the trial limit and every trial so far kept", () => {
      const search = create(createSeededRandom(21));
      const played: Trial[] = [];
      for (let count = 0; count < 5; count += 1) {
        const trial = trialOf(search.current());
        played.push(trial);
        search.respond(stepListener(-52)(trial));
      }
      const step = search.cutOff();
      expect(step.kind).toBe("finished");
      expect(search.current()).toBe(step);
      expect(step.result.trials.map((record) => record.trial)).toEqual(played);
      for (const ear of ["left", "right"] as const) {
        const earResult = step.result[ear];
        expect(earResult.state).toBe("unreliable");
        if (earResult.state === "unreliable") {
          expect(earResult.reasons).toContain("trialLimit");
        }
      }
      expect(() => search.respond("none")).toThrow(Error);
    });

    it("keeps the end of an ear that had already been found and cuts off only the other", () => {
      // The left ear is a step listener, found within a few presentations; the right one is
      // caught and missed in turn and is still going long after.
      const respondOf = (): Responder => {
        let rightCount = 0;
        return (trial) => {
          if (trial.kind === "noSound") {
            return "none";
          }
          if (trial.ear === "left") {
            return trial.levelDb >= -52 ? "left" : "none";
          }
          rightCount += 1;
          return rightCount % 2 === 1 ? "right" : "none";
        };
      };
      let seen = false;
      for (let answered = 1; answered <= 40 && !seen; answered += 1) {
        const search = create(createSeededRandom(24));
        const respond = respondOf();
        let step = search.current();
        for (
          let count = 0;
          count < answered && step.kind === "trial";
          count += 1
        ) {
          step = search.respond(respond(step.trial));
        }
        if (step.kind !== "trial") {
          break;
        }
        const cut = search.cutOff();
        if (cut.result.left.state === "found") {
          seen = true;
          expect(cut.result.right.state).toBe("unreliable");
          if (cut.result.right.state === "unreliable") {
            expect(cut.result.right.reasons).toContain("trialLimit");
          }
        }
      }
      expect(seen).toBe(true);
    });

    it("returns the same finished step when the room is already over", () => {
      const search = create(createSeededRandom(23));
      runRoom(search, neverAnswers);
      const finished = search.current();
      expect(search.cutOff()).toBe(finished);
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

describe("createThresholdSearch, the neighbour start (one-room design)", () => {
  it("starts an ear that has not played at the given level, drawing nothing and keeping the waiting trial's number and gap", () => {
    const random = createStubRandom(0.99);
    const search = createThresholdSearch({
      settings: hearingMethodConfig,
      random,
      method: "adaptive",
    });
    const waiting = trialOf(search.current());
    expect(waiting).toMatchObject({
      kind: "sound",
      ear: "right",
      levelDb: -25,
    });
    const calls = random.calls;
    expect(trialOf(search.steerStart("right", -37.4))).toEqual({
      ...waiting,
      levelDb: -37,
    });
    // The other ear moves too; the waiting trial is not its own.
    expect(trialOf(search.steerStart("left", -40))).toEqual({
      ...waiting,
      levelDb: -37,
    });
    expect(random.calls).toBe(calls);
    expect(search.earSearching("right")).toBe(true);
    expect(search.quietestCatchDb("right")).toBeNull();

    search.respond("right");
    expect(search.quietestCatchDb("right")).toBe(-37);
    // An ear that has played keeps its own course.
    const next = search.current();
    expect(search.steerStart("right", -50)).toBe(next);
    random.queue.push(0.99, 0);
    search.respond("right");
    expect(trialOf(search.current())).toMatchObject({
      ear: "left",
      levelDb: -40,
      direction: "first",
    });
  });

  it("leaves the staircase on its level grid", () => {
    const search = create(createStubRandom(0.99));
    const waiting = search.current();
    expect(search.steerStart("right", -37)).toBe(waiting);
    expect(trialOf(waiting)).toMatchObject({ kind: "sound", levelDb: -25 });
  });
});
