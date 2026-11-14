import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../../src/config/seeded-random";
import type {
  ListenerEar,
  ListenerResponse,
  ListenerTrial,
} from "./listener-types";
import {
  createPsychometricListener,
  type PsychometricListenerParameters,
} from "./psychometric-listener";

const trialCount = 20_000;
const rateToleranceFraction = 0.02;

const baseParameters: PsychometricListenerParameters = {
  trueThresholdDb: { left: -40, right: -10 },
  widthDb: 4,
  lapseFraction: 0,
  falseAlarmFraction: 0,
  wrongSideFraction: 0,
};

function responses(
  parameters: PsychometricListenerParameters,
  seed: number,
  trial: ListenerTrial,
  count = trialCount,
): ListenerResponse[] {
  const listener = createPsychometricListener(
    parameters,
    createSeededRandom(seed),
  );
  return Array.from({ length: count }, () => listener.respond(trial));
}

function shareOf(
  values: readonly ListenerResponse[],
  match: (response: ListenerResponse) => boolean,
): number {
  return values.filter(match).length / values.length;
}

const sound = (ear: ListenerEar, levelDb: number): ListenerTrial => ({
  kind: "sound",
  ear,
  levelDb,
});

describe("createPsychometricListener detection (R13.2)", () => {
  // With no false alarms and no wrong-side answers, any answer is a detection on its own side.
  const cases = [
    { lapseFraction: 0, widthDb: 4, seed: 101 },
    { lapseFraction: 0.08, widthDb: 2.5, seed: 102 },
    { lapseFraction: 0.05, widthDb: 8, seed: 103 },
  ];

  for (const { lapseFraction, widthDb, seed } of cases) {
    const parameters = { ...baseParameters, lapseFraction, widthDb };

    for (const ear of ["left", "right"] as const) {
      const thresholdDb = parameters.trueThresholdDb[ear];

      it(`detects ${ear} at its true threshold with chance (1 − lapse) / 2 (lapse ${String(lapseFraction)}, width ${String(widthDb)} dB)`, () => {
        const values = responses(parameters, seed, sound(ear, thresholdDb));
        expect(
          Math.abs(
            shareOf(values, (response) => response === ear) -
              (1 - lapseFraction) / 2,
          ),
        ).toBeLessThanOrEqual(rateToleranceFraction);
        expect(
          shareOf(
            values,
            (response) => response !== ear && response !== "none",
          ),
        ).toBe(0);
      });

      it(`detects ${ear} half a width above its true threshold with chance 0.9 × (1 − lapse) (lapse ${String(lapseFraction)}, width ${String(widthDb)} dB)`, () => {
        const values = responses(
          parameters,
          seed + 10,
          sound(ear, thresholdDb + widthDb / 2),
        );
        expect(
          Math.abs(
            shareOf(values, (response) => response === ear) -
              0.9 * (1 - lapseFraction),
          ),
        ).toBeLessThanOrEqual(rateToleranceFraction);
      });

      it(`detects ${ear} half a width below its true threshold with chance 0.1 × (1 − lapse) (lapse ${String(lapseFraction)}, width ${String(widthDb)} dB)`, () => {
        const values = responses(
          parameters,
          seed + 20,
          sound(ear, thresholdDb - widthDb / 2),
        );
        expect(
          Math.abs(
            shareOf(values, (response) => response === ear) -
              0.1 * (1 - lapseFraction),
          ),
        ).toBeLessThanOrEqual(rateToleranceFraction);
      });
    }
  }

  it("uses each ear's own threshold", () => {
    // -25 is 15 dB above the left threshold and 15 dB below the right one.
    const left = responses(baseParameters, 104, sound("left", -25));
    const right = responses(baseParameters, 105, sound("right", -25));
    expect(shareOf(left, (response) => response === "left")).toBeGreaterThan(
      0.99,
    );
    expect(shareOf(right, (response) => response === "right")).toBeLessThan(
      0.01,
    );
  });
});

describe("createPsychometricListener wrong side (R13.2)", () => {
  it("names the other ear for a detected sound with the wrong-side rate", () => {
    const wrongSideFraction = 0.1;
    // 30 dB above threshold with no lapses: every sound is detected.
    const values = responses(
      { ...baseParameters, wrongSideFraction },
      201,
      sound("left", -10),
    );
    expect(values).not.toContain("none");
    expect(
      Math.abs(
        shareOf(values, (response) => response === "right") - wrongSideFraction,
      ),
    ).toBeLessThanOrEqual(rateToleranceFraction);
  });
});

describe("createPsychometricListener false alarms (R13.3)", () => {
  const falseAlarmFraction = 0.3;
  const parameters = { ...baseParameters, falseAlarmFraction };

  it("answers on a no-sound trial with the false alarm rate", () => {
    const values = responses(parameters, 301, { kind: "noSound" });
    expect(
      Math.abs(
        shareOf(values, (response) => response !== "none") - falseAlarmFraction,
      ),
    ).toBeLessThanOrEqual(rateToleranceFraction);
  });

  it("names left and right equally often in its false alarms", () => {
    const values = responses(parameters, 302, { kind: "noSound" });
    const falseAlarms = values.filter((response) => response !== "none");
    expect(
      Math.abs(shareOf(falseAlarms, (response) => response === "left") - 0.5),
    ).toBeLessThanOrEqual(rateToleranceFraction);
  });

  it("answers on an undetected sound trial with the false alarm rate, naming either side", () => {
    // 40 dB below the left threshold: nothing is detected.
    const values = responses(parameters, 303, sound("left", -80));
    expect(
      Math.abs(
        shareOf(values, (response) => response !== "none") - falseAlarmFraction,
      ),
    ).toBeLessThanOrEqual(rateToleranceFraction);
    const answers = values.filter((response) => response !== "none");
    expect(
      Math.abs(shareOf(answers, (response) => response === "left") - 0.5),
    ).toBeLessThanOrEqual(rateToleranceFraction);
  });
});

describe("createPsychometricListener with width 0 (R13.4)", () => {
  const step = { ...baseParameters, widthDb: 0 };

  it("catches every sound at or above the true threshold", () => {
    expect(responses(step, 401, sound("left", -40), 2000)).toEqual(
      Array.from({ length: 2000 }, () => "left"),
    );
    expect(responses(step, 402, sound("right", 15), 2000)).toEqual(
      Array.from({ length: 2000 }, () => "right"),
    );
  });

  it("catches no sound below the true threshold", () => {
    expect(responses(step, 403, sound("left", -40.1), 2000)).toEqual(
      Array.from({ length: 2000 }, () => "none"),
    );
  });

  it("still lapses above the true threshold", () => {
    const lapseFraction = 0.1;
    const values = responses({ ...step, lapseFraction }, 404, sound("left", 0));
    expect(
      Math.abs(
        shareOf(values, (response) => response === "none") - lapseFraction,
      ),
    ).toBeLessThanOrEqual(rateToleranceFraction);
  });
});

describe("createPsychometricListener randomness (R13.6)", () => {
  const parameters: PsychometricListenerParameters = {
    trueThresholdDb: { left: -30, right: -30 },
    widthDb: 6,
    lapseFraction: 0.05,
    falseAlarmFraction: 0.2,
    wrongSideFraction: 0.05,
  };
  const trials: ListenerTrial[] = Array.from({ length: 500 }, (_, index) =>
    index % 5 === 0
      ? { kind: "noSound" }
      : sound(index % 2 === 0 ? "left" : "right", -40 + (index % 20)),
  );
  const run = (seed: number): ListenerResponse[] => {
    const listener = createPsychometricListener(
      parameters,
      createSeededRandom(seed),
    );
    return trials.map((trial) => listener.respond(trial));
  };

  it("gives the same answers from the same seed", () => {
    expect(run(501)).toEqual(run(501));
  });

  it("gives different answers from a different seed", () => {
    expect(run(502)).not.toEqual(run(501));
  });

  it("rejects a rate outside 0 to 1 and a negative width", () => {
    const random = createSeededRandom(503);
    expect(() =>
      createPsychometricListener({ ...parameters, lapseFraction: 1.5 }, random),
    ).toThrow(RangeError);
    expect(() =>
      createPsychometricListener({ ...parameters, widthDb: -1 }, random),
    ).toThrow(RangeError);
  });
});
