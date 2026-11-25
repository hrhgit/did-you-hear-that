import { describe, expect, it } from "vitest";
import type {
  AudioOutput,
  PlayOutcome,
  PlayRequest,
} from "../audio/output/create-audio-output";
import { createSeededRandom } from "../config/seeded-random";
import { swappedEarpieceOutput } from "./swapped-earpiece-output";

/** An output that records every `play` request and answers it from a script. */
function scriptedOutput(script: readonly PlayOutcome[]) {
  const requests: PlayRequest[] = [];
  const unused = (): never => {
    throw new Error("Not part of the script.");
  };
  const output: AudioOutput = Object.freeze({
    state: () => ({ kind: "running", sampleRateHz: 48000 }) as const,
    activate: unused,
    stopAll: () => undefined,
    onStop: () => () => undefined,
    onUnsupported: () => () => undefined,
    sampleRateHz: () => 48000,
    beginCalibration: unused,
    playCalibrationRepeat: unused,
    keepCalibration: unused,
    rangeReport: () => null,
    playHeadphoneCheck: unused,
    beginRoom: () => undefined,
    fadeOutSound: () => undefined,
    startBeat: unused,
    stopBeat: () => undefined,
    play(request: PlayRequest): PlayOutcome {
      const outcome = script[requests.length];
      requests.push(request);
      if (outcome === undefined) {
        throw new Error("The script has no more outcomes.");
      }
      return outcome;
    },
    clampLog: () => [],
    timestampPair: () => null,
  });
  return { output, requests };
}

const scheduled: PlayOutcome = Object.freeze({
  kind: "scheduled",
  startMs: 50,
  endMs: 1050,
  requestedLevelDb: -30,
  playedLevelDb: -30,
  clampLimit: null,
});
const busy: PlayOutcome = Object.freeze({ kind: "refused", reason: "busy" });

describe("swappedEarpieceOutput", () => {
  it("sends a request for each ear to the other earpiece and changes no other field", () => {
    const { output, requests } = scriptedOutput([scheduled, scheduled]);
    const swapped = swappedEarpieceOutput(output);
    const random = createSeededRandom(7);
    const forLeft: PlayRequest = {
      soundId: "stairs",
      ear: "left",
      levelDb: -35,
      purpose: "trial",
      random,
    };
    const forRight: PlayRequest = {
      soundId: "cellar",
      ear: "right",
      levelDb: 5,
      purpose: "trial",
      random,
    };
    swapped.play(forLeft);
    swapped.play(forRight);
    expect(requests).toEqual([
      { ...forLeft, ear: "right" },
      { ...forRight, ear: "left" },
    ]);
    expect(requests[0].random).toBe(random);
    expect(requests[1].random).toBe(random);
    // The caller's request is not changed.
    expect(forLeft.ear).toBe("left");
    expect(forRight.ear).toBe("right");
  });

  it("gives the shell's outcome unchanged", () => {
    const { output } = scriptedOutput([scheduled, busy]);
    const swapped = swappedEarpieceOutput(output);
    const request: PlayRequest = {
      soundId: "attic",
      ear: "left",
      levelDb: -20,
      purpose: "trial",
      random: createSeededRandom(1),
    };
    expect(swapped.play(request)).toBe(scheduled);
    expect(swapped.play(request)).toBe(busy);
  });

  it("gives the shell's own method for everything but play", () => {
    const { output } = scriptedOutput([]);
    const swapped = swappedEarpieceOutput(output);
    const names = Object.keys(output) as (keyof AudioOutput)[];
    expect(Object.keys(swapped).sort()).toEqual([...names].sort());
    for (const name of names) {
      if (name === "play") {
        expect(swapped.play).not.toBe(output.play);
      } else {
        expect(swapped[name]).toBe(output[name]);
      }
    }
  });

  it("is frozen", () => {
    expect(
      Object.isFrozen(swappedEarpieceOutput(scriptedOutput([]).output)),
    ).toBe(true);
  });
});
