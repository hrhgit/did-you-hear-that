import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../../src/config/seeded-random";
import type {
  ListenerEar,
  ListenerTrial,
  SimulatedListener,
} from "./listener-types";
import { createPsychometricListener } from "./psychometric-listener";
import { wornHeadphones, type WornHeadphonesOptions } from "./worn-headphones";

const asMarked = { left: "left", right: "right" } as const;
const swapped = { left: "right", right: "left" } as const;

/** A listener that records what it was told and answers "none". */
function recordingListener(): {
  listener: SimulatedListener;
  told: ListenerTrial[];
} {
  const told: ListenerTrial[] = [];
  return {
    told,
    listener: {
      respond(trial) {
        told.push(trial);
        return "none";
      },
    },
  };
}

/** A Step_Listener with these true thresholds. */
const stepListener = (trueThresholdDb: Record<ListenerEar, number>) =>
  createPsychometricListener(
    {
      trueThresholdDb,
      widthDb: 0,
      lapseFraction: 0,
      falseAlarmFraction: 0,
      wrongSideFraction: 0,
    },
    createSeededRandom(0),
  );

/** The quietest level on the 1 dB grid from −90 to 30 dB that the worn listener catches on this earpiece. */
function quietestCaught(
  hear: ReturnType<typeof wornHeadphones>,
  earpiece: ListenerEar,
): { levelDb: number; side: string } | null {
  for (let levelDb = -90; levelDb <= 30; levelDb += 1) {
    const side = hear({ kind: "sound", earpiece, levelDb });
    if (side !== "none") {
      return { levelDb, side };
    }
  }
  return null;
}

describe("wornHeadphones", () => {
  it("sends a sound on an earpiece to the ear it sits on, lowered by −H/2 on the left earpiece and +H/2 on the right", () => {
    const { listener, told } = recordingListener();
    const hear = wornHeadphones(listener, {
      imbalanceDb: 10,
      earpieceOnEar: asMarked,
    });
    hear({ kind: "sound", earpiece: "left", levelDb: -30 });
    hear({ kind: "sound", earpiece: "right", levelDb: -30 });
    expect(told).toEqual([
      { kind: "sound", ear: "left", levelDb: -25 },
      { kind: "sound", ear: "right", levelDb: -35 },
    ]);
  });

  it("sends a sound on an earpiece to the other ear when swapped", () => {
    const { listener, told } = recordingListener();
    const hear = wornHeadphones(listener, {
      imbalanceDb: -6,
      earpieceOnEar: swapped,
    });
    hear({ kind: "sound", earpiece: "left", levelDb: -30 });
    hear({ kind: "sound", earpiece: "right", levelDb: -30 });
    expect(told).toEqual([
      { kind: "sound", ear: "right", levelDb: -33 },
      { kind: "sound", ear: "left", levelDb: -27 },
    ]);
  });

  it("passes a no-sound trial to the listener unchanged", () => {
    const { listener, told } = recordingListener();
    const hear = wornHeadphones(listener, {
      imbalanceDb: 20,
      earpieceOnEar: swapped,
    });
    expect(hear({ kind: "noSound" })).toBe("none");
    expect(told).toEqual([{ kind: "noSound" }]);
  });

  it("reads the arrangement at every call", () => {
    const { listener, told } = recordingListener();
    const options: WornHeadphonesOptions = {
      imbalanceDb: 0,
      earpieceOnEar: asMarked,
    };
    const hear = wornHeadphones(listener, options);
    hear({ kind: "sound", earpiece: "left", levelDb: -30 });
    options.earpieceOnEar = swapped;
    hear({ kind: "sound", earpiece: "left", levelDb: -30 });
    options.earpieceOnEar = asMarked;
    hear({ kind: "sound", earpiece: "left", levelDb: -30 });
    expect(
      told.map((trial) => (trial.kind === "sound" ? trial.ear : null)),
    ).toEqual(["left", "right", "left"]);
  });

  it("gives a Step_Listener's catches at the thresholds shifted by the earpiece, as marked and swapped", () => {
    // True thresholds −40 on the left ear and −20 on the right; the right earpiece 10 dB quieter.
    const listener = stepListener({ left: -40, right: -20 });
    const marked = wornHeadphones(listener, {
      imbalanceDb: 10,
      earpieceOnEar: asMarked,
    });
    // Left earpiece on the left ear: plays 5 dB louder, so caught from −45.
    expect(quietestCaught(marked, "left")).toEqual({
      levelDb: -45,
      side: "left",
    });
    // Right earpiece on the right ear: plays 5 dB quieter, so caught from −15.
    expect(quietestCaught(marked, "right")).toEqual({
      levelDb: -15,
      side: "right",
    });
    const turned = wornHeadphones(listener, {
      imbalanceDb: 10,
      earpieceOnEar: swapped,
    });
    // Left earpiece on the right ear: caught on the right from −25.
    expect(quietestCaught(turned, "left")).toEqual({
      levelDb: -25,
      side: "right",
    });
    // Right earpiece on the left ear: caught on the left from −35.
    expect(quietestCaught(turned, "right")).toEqual({
      levelDb: -35,
      side: "left",
    });
  });

  it("gives the listener's own thresholds with no imbalance", () => {
    const listener = stepListener({ left: -52, right: -31 });
    const marked = wornHeadphones(listener, {
      imbalanceDb: 0,
      earpieceOnEar: asMarked,
    });
    expect(quietestCaught(marked, "left")).toEqual({
      levelDb: -52,
      side: "left",
    });
    expect(quietestCaught(marked, "right")).toEqual({
      levelDb: -31,
      side: "right",
    });
  });

  it("throws a RangeError for an imbalance that is not finite and for both earpieces on one ear", () => {
    const { listener } = recordingListener();
    expect(() =>
      wornHeadphones(listener, {
        imbalanceDb: Number.NaN,
        earpieceOnEar: asMarked,
      }),
    ).toThrow(RangeError);
    const hear = wornHeadphones(listener, {
      imbalanceDb: 0,
      earpieceOnEar: { left: "left", right: "left" },
    });
    expect(() => hear({ kind: "sound", earpiece: "left", levelDb: 0 })).toThrow(
      RangeError,
    );
  });
});
