import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../../src/config/seeded-random";
import {
  extremeListeners,
  type ExtremeListenerName,
} from "./extreme-listeners";
import type { ListenerResponse, ListenerTrial } from "./listener-types";

const trialCount = 20_000;
const rateToleranceFraction = 0.02;

const leftSound: ListenerTrial = { kind: "sound", ear: "left", levelDb: -30 };
const rightSound: ListenerTrial = { kind: "sound", ear: "right", levelDb: 10 };
const noSound: ListenerTrial = { kind: "noSound" };

function responses(
  name: ExtremeListenerName,
  seed: number,
  trial: ListenerTrial,
): ListenerResponse[] {
  const listener = extremeListeners[name](createSeededRandom(seed));
  return Array.from({ length: trialCount }, () => listener.respond(trial));
}

function shareOf(
  values: readonly ListenerResponse[],
  response: ListenerResponse,
): number {
  return values.filter((value) => value === response).length / values.length;
}

function expectShare(
  values: readonly ListenerResponse[],
  response: ListenerResponse,
  expectedFraction: number,
): void {
  expect(
    Math.abs(shareOf(values, response) - expectedFraction),
    `share of "${response}"`,
  ).toBeLessThanOrEqual(rateToleranceFraction);
}

describe("extremeListeners (R13.5)", () => {
  it("lists exactly the five extreme listeners", () => {
    expect(Object.keys(extremeListeners).sort()).toEqual([
      "alwaysAnswers",
      "alwaysAnswersWrongSide",
      "alwaysPressesLeft",
      "answersAtRandom",
      "neverAnswers",
    ]);
  });

  describe("alwaysAnswers", () => {
    for (const [label, trial] of [
      ["a left sound", leftSound],
      ["a right sound", rightSound],
      ["a no-sound trial", noSound],
    ] as const) {
      it(`names a random side on ${label}`, () => {
        const values = responses("alwaysAnswers", 11, trial);
        expect(values).not.toContain("none");
        expectShare(values, "left", 0.5);
      });
    }
  });

  describe("neverAnswers", () => {
    it('answers "none" on sound and no-sound trials', () => {
      for (const trial of [leftSound, rightSound, noSound]) {
        expect(new Set(responses("neverAnswers", 21, trial))).toEqual(
          new Set(["none"]),
        );
      }
    });
  });

  describe("answersAtRandom", () => {
    for (const [label, trial] of [
      ["a left sound", leftSound],
      ["a no-sound trial", noSound],
    ] as const) {
      it(`answers left, right and none with equal chance on ${label}`, () => {
        const values = responses("answersAtRandom", 31, trial);
        expectShare(values, "left", 1 / 3);
        expectShare(values, "right", 1 / 3);
        expectShare(values, "none", 1 / 3);
      });
    }
  });

  describe("alwaysAnswersWrongSide", () => {
    it("names the other ear on every sound trial", () => {
      expect(
        new Set(responses("alwaysAnswersWrongSide", 41, leftSound)),
      ).toEqual(new Set(["right"]));
      expect(
        new Set(responses("alwaysAnswersWrongSide", 42, rightSound)),
      ).toEqual(new Set(["left"]));
    });

    it("names a random side on every no-sound trial", () => {
      const values = responses("alwaysAnswersWrongSide", 43, noSound);
      expect(values).not.toContain("none");
      expectShare(values, "left", 0.5);
    });
  });

  describe("alwaysPressesLeft", () => {
    it('answers "left" on sound and no-sound trials', () => {
      for (const trial of [leftSound, rightSound, noSound]) {
        expect(new Set(responses("alwaysPressesLeft", 51, trial))).toEqual(
          new Set(["left"]),
        );
      }
    });
  });

  it("gives the same answers from the same seed (R13.6)", () => {
    const trials = [leftSound, noSound, rightSound, noSound, leftSound];
    for (const name of Object.keys(extremeListeners) as ExtremeListenerName[]) {
      const run = (): ListenerResponse[] => {
        const listener = extremeListeners[name](createSeededRandom(61));
        return Array.from({ length: 200 }, (_, index) =>
          listener.respond(trials[index % trials.length]),
        );
      };
      expect(run(), name).toEqual(run());
    }
  });
});
