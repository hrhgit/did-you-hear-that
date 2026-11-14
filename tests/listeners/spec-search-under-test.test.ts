import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { createSeededRandom } from "../../src/config/seeded-random";
import { roomLimits } from "../../src/engine/room-limits";
import type { RoomResult } from "../../src/engine/search-types";
import { createThresholdSearch } from "../../src/engine/threshold-search";
import { extremeListeners } from "./extreme-listeners";
import type {
  ListenerResponse,
  ListenerTrial,
  SimulatedListener,
} from "./listener-types";
import { createPsychometricListener } from "./psychometric-listener";
import { searchesUnderTest } from "./searches-under-test";
import { runSpecRoom, specSearchUnderTest } from "./spec-search-under-test";

const settings = hearingMethodConfig;
const trialBudget = roomLimits(settings).roomTrialLimitCount;

const stepListener = (): SimulatedListener =>
  createPsychometricListener(
    {
      trueThresholdDb: { left: -52, right: -80 },
      widthDb: 0,
      lapseFraction: 0,
      falseAlarmFraction: 0,
      wrongSideFraction: 0,
    },
    createSeededRandom(1),
  );

const guessingListener = (): SimulatedListener =>
  createPsychometricListener(
    {
      trueThresholdDb: { left: -30, right: 0 },
      widthDb: 6,
      lapseFraction: 0.05,
      falseAlarmFraction: 0.4,
      wrongSideFraction: 0.05,
    },
    createSeededRandom(2),
  );

/** Plays a room directly on the engine, answering with `listener`. */
function playDirectly(seed: number, listener: SimulatedListener): RoomResult {
  const search = createThresholdSearch({
    settings,
    random: createSeededRandom(seed),
  });
  let step = search.current();
  while (step.kind === "trial") {
    const { trial } = step;
    step = search.respond(
      listener.respond(
        trial.kind === "sound"
          ? { kind: "sound", ear: trial.ear, levelDb: trial.levelDb }
          : { kind: "noSound" },
      ),
    );
  }
  return step.result;
}

describe("specSearchUnderTest", () => {
  it("describes the spec engine", () => {
    expect(specSearchUnderTest.name).toBe("spec");
    expect(specSearchUnderTest.takesSettings).toBe(true);
    expect(specSearchUnderTest.takesSeed).toBe(true);
  });

  it("maps every trial and both ear results one to one", () => {
    for (const makeListener of [stepListener, guessingListener]) {
      const run = specSearchUnderTest.runRoom({
        seed: 7,
        settings,
        listener: makeListener(),
        trialBudget,
      });
      const result = playDirectly(7, makeListener());
      expect(run.ending).toBe("finished");
      expect(run.error).toBeUndefined();
      expect(run.trials).toEqual(
        result.trials.map(({ trial, response }) =>
          trial.kind === "sound"
            ? {
                kind: "sound",
                ear: trial.ear,
                levelDb: trial.levelDb,
                gapBeforeMs: trial.gapBeforeMs,
                response,
              }
            : { kind: "noSound", gapBeforeMs: trial.gapBeforeMs, response },
        ),
      );
      for (const ear of ["left", "right"] as const) {
        const earResult = result[ear];
        expect(run.ears[ear]).toEqual(
          earResult.state === "found"
            ? { state: "found", thresholdDb: earResult.thresholdDb }
            : { state: earResult.state },
        );
      }
      expect(run.falseAlarmRateFraction).toBe(result.falseAlarmRateFraction);
    }
  });

  it("reports the step listener's ears as found and better than floor", () => {
    const run = specSearchUnderTest.runRoom({
      seed: 3,
      settings,
      listener: stepListener(),
      trialBudget,
    });
    expect(run.ears).toEqual({
      left: { state: "found", thresholdDb: -50 },
      right: { state: "betterThanFloor" },
    });
  });

  it("tells the listener only the kind, ear and level of each trial (R13.7)", () => {
    const seen: ListenerTrial[] = [];
    const recording: SimulatedListener = {
      respond: (trial): ListenerResponse => {
        seen.push(trial);
        return "none";
      },
    };
    specSearchUnderTest.runRoom({
      seed: 4,
      settings,
      listener: recording,
      trialBudget,
    });
    expect(seen.length).toBeGreaterThan(0);
    for (const trial of seen) {
      expect(Object.keys(trial).sort()).toEqual(
        trial.kind === "sound" ? ["ear", "kind", "levelDb"] : ["kind"],
      );
    }
  });

  it("stops a run that asks for more trials than its budget", () => {
    const run = specSearchUnderTest.runRoom({
      seed: 5,
      settings,
      listener: extremeListeners.neverAnswers(createSeededRandom(5)),
      trialBudget: 3,
    });
    expect(run.ending).toBe("budgetExceeded");
    expect(run.trials).toHaveLength(3);
    expect(run.ears).toEqual({
      left: { state: "unreported" },
      right: { state: "unreported" },
    });
    expect(run.falseAlarmRateFraction).toBeUndefined();
  });

  it("finishes a room that needs exactly its budget", () => {
    const full = specSearchUnderTest.runRoom({
      seed: 6,
      settings,
      listener: extremeListeners.neverAnswers(createSeededRandom(6)),
      trialBudget,
    });
    const exact = specSearchUnderTest.runRoom({
      seed: 6,
      settings,
      listener: extremeListeners.neverAnswers(createSeededRandom(6)),
      trialBudget: full.trials.length,
    });
    expect(exact.ending).toBe("finished");
    expect(exact).toEqual(full);
  });

  it("reports a search that throws, with its message", () => {
    const run = specSearchUnderTest.runRoom({
      seed: 8,
      settings: { ...settings, floorDb: -72 },
      listener: stepListener(),
      trialBudget,
    });
    expect(run.ending).toBe("threw");
    expect(run.error).toContain("floorDb");
    expect(run.trials).toEqual([]);
  });

  it("returns frozen runs", () => {
    const run = specSearchUnderTest.runRoom({
      seed: 9,
      settings,
      listener: guessingListener(),
      trialBudget,
    });
    expect(Object.isFrozen(run)).toBe(true);
    expect(Object.isFrozen(run.trials)).toBe(true);
    expect(Object.isFrozen(run.trials[0])).toBe(true);
    expect(Object.isFrozen(run.ears)).toBe(true);
  });
});

describe("runSpecRoom", () => {
  it("returns the engine's full room result", () => {
    const result = runSpecRoom({
      seed: 10,
      settings,
      listener: guessingListener(),
      trialBudget,
    });
    expect(result).toEqual(playDirectly(10, guessingListener()));
  });

  it("throws when the room asks for more trials than its budget", () => {
    expect(() =>
      runSpecRoom({
        seed: 11,
        settings,
        listener: extremeListeners.neverAnswers(createSeededRandom(11)),
        trialBudget: 3,
      }),
    ).toThrow(/more than 3 trials/);
  });

  it("passes on what the engine throws", () => {
    expect(() =>
      runSpecRoom({
        seed: 12,
        settings: { ...settings, floorDb: -72 },
        listener: stepListener(),
        trialBudget,
      }),
    ).toThrow(RangeError);
  });
});

describe("searchesUnderTest", () => {
  it("lists the spec engine by its name", () => {
    expect(searchesUnderTest).toEqual({ spec: specSearchUnderTest });
  });
});
