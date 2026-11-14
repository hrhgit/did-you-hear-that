import { describe, expect, it } from "vitest";
import { classifyResponse } from "./classify-response";
import type {
  Ear,
  NoSoundTrial,
  SoundTrial,
  VisitorResponse,
} from "./search-types";

function soundTrial(ear: Ear): SoundTrial {
  return {
    kind: "sound",
    trialNumber: 1,
    ear,
    levelDb: -25,
    direction: "first",
    gapBeforeMs: 1500,
  };
}

const noSoundTrial: NoSoundTrial = {
  kind: "noSound",
  trialNumber: 1,
  phase: "search",
  gapBeforeMs: 1500,
};

const otherEar = { left: "right", right: "left" } as const;

describe("classifyResponse", () => {
  for (const ear of ["left", "right"] as const) {
    describe(`on a sound trial for the ${ear} ear`, () => {
      it("classifies the trial's ear as caught (R4.2)", () => {
        expect(classifyResponse(soundTrial(ear), ear)).toBe("caught");
      });

      it("classifies the other ear as wrong side (R4.3)", () => {
        expect(classifyResponse(soundTrial(ear), otherEar[ear])).toBe(
          "wrongSide",
        );
      });

      it('classifies "none" as missed (R4.4)', () => {
        expect(classifyResponse(soundTrial(ear), "none")).toBe("missed");
      });
    });

    it(`classifies ${ear} on a no-sound trial as a false alarm (R4.5)`, () => {
      expect(classifyResponse(noSoundTrial, ear)).toBe("falseAlarm");
    });
  }

  it('classifies "none" on a no-sound trial as no response (R4.6)', () => {
    expect(classifyResponse(noSoundTrial, "none")).toBe("noResponse");
  });

  for (const invalid of ["LEFT", "", undefined, 0] as unknown[]) {
    it(`throws a TypeError for ${JSON.stringify(invalid) ?? "undefined"} (R4.7)`, () => {
      for (const trial of [soundTrial("left"), noSoundTrial]) {
        expect(() =>
          classifyResponse(trial, invalid as VisitorResponse),
        ).toThrow(TypeError);
      }
    });
  }
});
