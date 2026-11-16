import { describe, expect, it } from "vitest";
import { bannedTerms } from "../config/banned-terms";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { ghostSoundIds, type GhostSoundId } from "../config/sound-id";
import { calibrationCopy } from "./calibration-copy";
import { findBannedTerms } from "./find-banned-terms";
import { headphoneCheckCopy } from "./headphone-check-copy";
import { leavingCopy } from "./leaving-copy";
import { limitsStatement } from "./limits-statement";
import type { UnreliableReasonName, WingWords } from "./result-lines";
import { roomCopy } from "./room-copy";
import * as swappedRepeatCopyModule from "./swapped-repeat-copy";
import { swappedRepeatCopy } from "./swapped-repeat-copy";
import {
  comparisonDescription,
  outcomeLines,
  readyLines,
  swappedCaughtLine,
  type ComparisonRunWords,
  type ComparisonWords,
  type SwapSideName,
  type SwappedRepeatOutcomeName,
  type SwappedRepeatUnclearReasonName,
} from "./swapped-repeat-lines";

// The copy of the swapped repeat (swapped-repeat design.md, "The copy" and "The copy tests").

/** Every string reachable from a module's exports, with the path to it. */
function stringsOf(
  moduleName: string,
  exports: Record<string, unknown>,
): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  const walk = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      found.push({ path, text: value });
    } else if (typeof value === "object" && value !== null) {
      for (const [key, nested] of Object.entries(value)) {
        walk(nested, `${path}.${key}`);
      }
    }
  };
  for (const [name, value] of Object.entries(exports)) {
    walk(value, `${moduleName}.${name}`);
  }
  return found;
}

/** Every object reachable from a value, the value included, with the path to it. */
function objectsOf(
  name: string,
  value: unknown,
): { path: string; object: object }[] {
  const found: { path: string; object: object }[] = [];
  const walk = (nested: unknown, path: string): void => {
    if (typeof nested === "object" && nested !== null) {
      found.push({ path, object: nested });
      for (const [key, child] of Object.entries(nested)) {
        walk(child, `${path}.${key}`);
      }
    }
  };
  walk(value, name);
  return found;
}

const constantStrings = stringsOf("swappedRepeatCopy", swappedRepeatCopyModule);

describe("the swapped repeat's fixed copy", () => {
  it("has strings to check", () => {
    expect(constantStrings.length).toBe(43);
  });

  it.each(constantStrings)(
    "$path is non-empty, trimmed and uses no banned term",
    ({ text }) => {
      expect(findBannedTerms(text, bannedTerms)).toEqual([]);
      expect(text.trim()).toBe(text);
      expect(text).not.toBe("");
    },
  );

  it("has the design's wording", () => {
    expect(swappedRepeatCopy).toEqual({
      heading: "This room again, with the headphones swapped",
      backButton: "Back to the picture",
      stopButton: "Stop the sounds",
      instructionLines: [
        "Take the headphones off and put them on the other way round: the left earpiece on your right ear, and the right earpiece on your left ear.",
        "Leave your system volume where it is now. The house keeps every sound below its limit only if you do not turn the volume up.",
        "When they are on, the house plays a hiss in one earpiece, so that you can check the swap.",
      ],
      againLine:
        "The hiss was on your left, so the headphones are still the way they were. Put the left earpiece on your right ear and the right earpiece on your left ear, then check again.",
      confirmButton: "They are swapped",
      playCheckButton: "Play the check",
      question: "Which side was the hiss on?",
      answers: {
        left: "Left",
        right: "Right",
        bothSides: "Both sides",
        nothingHeard: "I heard nothing",
      },
      judgementLines: {
        confirmed:
          "The hiss came from the left earpiece and you heard it on your right. The headphones are swapped.",
        bothSides:
          "The hiss came from one side only. Your device may be set to play the same sound in both ears. Turn that setting off and try again.",
        notHeard:
          "Check that both earpieces are on and connected, then try again.",
      },
      cutLine: "The hiss was cut off. Play the check again.",
      playRefusedLine:
        "The house could not play the hiss just now. Try again in a moment.",
      startButton: "Go into the room",
      pauseButton: "Pause",
      resumeButton: "Go on",
      pauseLines: {
        visitor:
          "The visit is paused. The sound you were waiting for will come again later.",
        hidden:
          "The visit paused while this page was out of sight. The sound you were waiting for will come again later.",
        interrupted:
          "Something else on this device took over the sound, so the visit paused. The sound you were waiting for will come again later.",
      },
      unavailableLines: {
        calibrationGone:
          "Your audio device changed after the rooms, so the house no longer has your calibration. This room cannot be visited again on this visit. Your picture has not changed.",
        calibrationChanged:
          "Your audio device changed after this room, so the house would play it with another calibration. This room cannot be visited again on this visit. Your picture has not changed.",
      },
      endLines: {
        finished: "That was this room again, with the headphones swapped.",
        deviceChanged:
          "Your audio device changed, so the house stopped the room. Your picture has not changed.",
        soundRefused:
          "The house could not play its sounds on this device, so it stopped the room. Your picture has not changed.",
      },
      turnBackLine:
        "If the headphones are still swapped, turn them back now, so that the left earpiece is on your left ear.",
      comparisonHeading: "This room both ways round",
      runLabels: {
        asMarked: "Headphones as marked",
        swapped: "Headphones swapped",
      },
      earpieceLabels: { left: "Left earpiece", right: "Right earpiece" },
      earpieceMarks: { left: "L", right: "R" },
      outcomeLabels: {
        followsEar: "The difference stayed with your ears",
        followsEarpiece: "The difference moved with the headphones",
        unclear: "Not clear",
      },
      savedAgainLine: "The saved visit now holds the room you visited again.",
      savedCopyLacksLine:
        "The saved visit does not hold the room you visited again yet. Save again to add it.",
    });
  });

  it("takes every reused string from its source", () => {
    expect(swappedRepeatCopy.instructionLines[1]).toBe(
      calibrationCopy.keptLine,
    );
    expect(swappedRepeatCopy.playCheckButton).toBe(
      headphoneCheckCopy.playButton,
    );
    expect(swappedRepeatCopy.question).toBe(headphoneCheckCopy.question);
    expect(swappedRepeatCopy.answers).toBe(headphoneCheckCopy.answers);
    expect(swappedRepeatCopy.judgementLines.bothSides).toBe(
      headphoneCheckCopy.judgementLines.bothSides,
    );
    expect(swappedRepeatCopy.judgementLines.notHeard).toBe(
      headphoneCheckCopy.judgementLines.notHeard,
    );
    expect(swappedRepeatCopy.pauseButton).toBe(roomCopy.pauseButton);
    expect(swappedRepeatCopy.resumeButton).toBe(roomCopy.goOnButton);
    expect(swappedRepeatCopy.pauseLines.visitor).toBe(
      leavingCopy.pauseLines.visitor,
    );
    expect(swappedRepeatCopy.pauseLines.hidden).toBe(
      leavingCopy.pauseLines.hidden,
    );
    expect(swappedRepeatCopy.pauseLines.interrupted).toBe(
      leavingCopy.pauseLines.interrupted,
    );
  });

  it("marks each earpiece with the letter printed on headphones, keyed by earpiece", () => {
    expect(Object.keys(swappedRepeatCopy.earpieceMarks)).toEqual([
      "left",
      "right",
    ]);
    expect(swappedRepeatCopy.earpieceMarks.left).toBe("L");
    expect(swappedRepeatCopy.earpieceMarks.right).toBe("R");
  });

  it.each(objectsOf("swappedRepeatCopy", swappedRepeatCopy))(
    "$path is frozen",
    ({ object }) => {
      expect(Object.isFrozen(object)).toBe(true);
    },
  );
});

// ─── The lines that depend on the repeat (task 3) ─────────────────────────────────────────

const stairsFirstRun: ComparisonRunWords = {
  left: { state: "found", thresholdDb: -40, reasons: [], earpiece: "left" },
  right: { state: "found", thresholdDb: -20, reasons: [], earpiece: "right" },
  rightMinusLeftDb: 20,
};

const stairsRepeat: ComparisonRunWords = {
  left: { state: "found", thresholdDb: -40, reasons: [], earpiece: "right" },
  right: { state: "found", thresholdDb: -20, reasons: [], earpiece: "left" },
  rightMinusLeftDb: 20,
};

const professionalSentence = limitsStatement.sentences[3];

describe("the swapped repeat's lines", () => {
  it("gives the ready lines of the design", () => {
    expect(readyLines("stairs", 4000)).toEqual([
      "Stairs, 4 kHz. The room runs again just as it did before.",
      "Say on which side you hear each sound, as you did the first time. The side is your own ear, whichever earpiece is on it.",
    ]);
    expect(Object.isFrozen(readyLines("stairs", 4000))).toBe(true);
  });

  it("gives the caught lines of the design", () => {
    expect(swappedCaughtLine("left", "right", 4000, -35)).toBe(
      "You caught it on your left, from the right earpiece. 4 kHz, 35 dB quieter than your calibration.",
    );
    expect(swappedCaughtLine("right", "left", 1000, 0.2)).toBe(
      "You caught it on your right, from the left earpiece. 1 kHz, as loud as your calibration.",
    );
  });

  it("gives the outcome lines of the design", () => {
    expect(outcomeLines("followsEar", null)).toEqual([
      "When you swapped the headphones, the same ear needed the louder sound. So the difference seems to belong to your ears.",
      "See a hearing professional if a difference between your left and your right is still there after you swap the headphones, if your hearing changes suddenly, or if ringing in your ears does not go away.",
    ]);
    expect(outcomeLines("followsEarpiece", null)).toEqual([
      "When you swapped the headphones, the same earpiece needed the louder sound. So the difference seems to belong to the headphones.",
    ]);
    expect(outcomeLines("unclear", "differenceShrank")).toEqual([
      "The swap did not make it clear where the difference belongs.",
      "With the headphones swapped, your left and right came out close together.",
    ]);
    expect(outcomeLines("unclear", "noLevel")).toEqual([
      "The swap did not make it clear where the difference belongs.",
      "With the headphones swapped, one side has no level, so the two runs of this room cannot be set side by side.",
    ]);
  });

  it("takes the professional sentence of followsEar from the limits statement itself", () => {
    expect(outcomeLines("followsEar", null)[1]).toBe(professionalSentence);
  });

  it("gives frozen outcome lines", () => {
    for (const [outcome, reason] of outcomeCases) {
      expect(Object.isFrozen(outcomeLines(outcome, reason))).toBe(true);
    }
  });

  it("describes a first run and a repeat that both put the quieter sound on the left ear", () => {
    expect(
      comparisonDescription({
        roomId: "stairs",
        frequencyHz: 4000,
        runs: [stairsFirstRun, stairsRepeat],
        outcome: "followsEar",
        unclearReason: null,
      }),
    ).toBe(
      "Stairs, 4 kHz. Headphones as marked: left ear with the left earpiece, the quietest sound you caught here was 40 dB quieter than your calibration; right ear with the right earpiece, the quietest sound you caught here was 20 dB quieter than your calibration; 20 dB quieter on the left. Headphones swapped: left ear with the right earpiece, the quietest sound you caught here was 40 dB quieter than your calibration; right ear with the left earpiece, the quietest sound you caught here was 20 dB quieter than your calibration; 20 dB quieter on the left. " +
        outcomeLines("followsEar", null).join(" "),
    );
  });

  it("describes a repeat without a level and a repeat with no difference in words, not as a number", () => {
    const noLevel = comparisonDescription({
      roomId: "attic",
      frequencyHz: 8000,
      runs: [
        stairsFirstRun,
        {
          left: {
            state: "unreliable",
            thresholdDb: null,
            reasons: ["levelNotAsAsked"],
            earpiece: "right",
          },
          right: {
            state: "betterThanFloor",
            thresholdDb: null,
            reasons: [],
            earpiece: "left",
          },
          rightMinusLeftDb: null,
        },
      ],
      outcome: "unclear",
      unclearReason: "noLevel",
    });
    expect(noLevel).toContain(
      "Headphones swapped: left ear with the right earpiece, this room should be visited again (a sound here was not played at the level the house asked for); right ear with the left earpiece, quieter than this house can whisper; no left and right difference, because one side has no level.",
    );
    const same = comparisonDescription({
      roomId: "attic",
      frequencyHz: 8000,
      runs: [
        stairsFirstRun,
        {
          ...stairsRepeat,
          right: { ...stairsRepeat.right, thresholdDb: -40 },
          rightMinusLeftDb: 0,
        },
      ],
      outcome: "unclear",
      unclearReason: "differenceShrank",
    });
    expect(same).toContain("the same level on the left and on the right.");
    expect(same).not.toContain("0 dB;");
    expect(same).not.toContain("0 dB.");
  });

  it("throws a RangeError for an ear and an earpiece of the same side", () => {
    for (const side of sides) {
      expect(() => swappedCaughtLine(side, side, 4000, -35)).toThrow(
        RangeError,
      );
    }
  });

  it("throws a RangeError for an outcome and a reason that do not fit", () => {
    expect(() => outcomeLines("unclear", null)).toThrow(RangeError);
    expect(() => outcomeLines("followsEar", "noLevel")).toThrow(RangeError);
    expect(() => outcomeLines("followsEarpiece", "differenceShrank")).toThrow(
      RangeError,
    );
    expect(() =>
      outcomeLines("other" as SwappedRepeatOutcomeName, null),
    ).toThrow(RangeError);
    expect(() =>
      outcomeLines("unclear", "other" as SwappedRepeatUnclearReasonName),
    ).toThrow(RangeError);
  });

  it("throws a RangeError for other values that do not fit", () => {
    expect(() => readyLines("garden" as GhostSoundId, 4000)).toThrow(
      RangeError,
    );
    expect(() => readyLines("stairs", 0)).toThrow(RangeError);
    expect(() =>
      swappedCaughtLine("up" as SwapSideName, "left", 4000, -35),
    ).toThrow(RangeError);
    expect(() => swappedCaughtLine("left", "right", 4000, Number.NaN)).toThrow(
      RangeError,
    );
    const words = (overrides: Partial<ComparisonWords>): ComparisonWords => ({
      roomId: "stairs",
      frequencyHz: 4000,
      runs: [stairsFirstRun, stairsRepeat],
      outcome: "followsEar",
      unclearReason: null,
      ...overrides,
    });
    expect(() =>
      comparisonDescription(words({ roomId: "garden" as GhostSoundId })),
    ).toThrow(RangeError);
    expect(() => comparisonDescription(words({ outcome: "unclear" }))).toThrow(
      RangeError,
    );
    // The repeat with each ear on its own earpiece, and the first run swapped.
    expect(() =>
      comparisonDescription(words({ runs: [stairsFirstRun, stairsFirstRun] })),
    ).toThrow(RangeError);
    expect(() =>
      comparisonDescription(words({ runs: [stairsRepeat, stairsRepeat] })),
    ).toThrow(RangeError);
    // A difference without both ears found, and none with both found.
    expect(() =>
      comparisonDescription(
        words({
          runs: [stairsFirstRun, { ...stairsRepeat, rightMinusLeftDb: null }],
        }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      comparisonDescription(
        words({
          runs: [
            stairsFirstRun,
            {
              ...stairsRepeat,
              left: {
                state: "worseThanCap",
                thresholdDb: null,
                reasons: [],
                earpiece: "right",
              },
            },
          ],
        }),
      ),
    ).toThrow(RangeError);
  });
});

// ─── Representative inputs ─────────────────────────────────────────────────────────────────

const sides: readonly SwapSideName[] = ["left", "right"];

const otherSide = (side: SwapSideName): SwapSideName =>
  side === "left" ? "right" : "left";

const pitches: readonly number[] = [
  ...new Set(Object.values(hearingMethodConfig.roomFrequenciesHz).flat()),
];

/** The floor to the cap, −70 to 5 dB, in 5 dB steps, and −0.4, 0 and 0.4. */
const levels: readonly number[] = [
  ...Array.from(
    {
      length:
        (hearingMethodConfig.capRelativeToAnchorDb -
          hearingMethodConfig.floorDb) /
          hearingMethodConfig.upwardStepDb +
        1,
    },
    (_, index) =>
      hearingMethodConfig.floorDb + index * hearingMethodConfig.upwardStepDb,
  ),
  -0.4,
  0,
  0.4,
];

const unreliableReasons: readonly UnreliableReasonName[] = [
  "trialLimit",
  "inconsistentCatch",
  "falseAlarmRate",
  "levelNotAsAsked",
  "visitFalseAlarmRate",
];

/** Every state of a wing: found at every level, the two states without a level, and unreliable with each reason and none. */
const wingStates: readonly WingWords[] = [
  ...levels.map((thresholdDb): WingWords => ({
    state: "found",
    thresholdDb,
    reasons: [],
  })),
  { state: "betterThanFloor", thresholdDb: null, reasons: [] },
  { state: "worseThanCap", thresholdDb: null, reasons: [] },
  { state: "unreliable", thresholdDb: null, reasons: [] },
  ...unreliableReasons.map((reason): WingWords => ({
    state: "unreliable",
    thresholdDb: null,
    reasons: [reason],
  })),
];

const outcomeCases: readonly [
  SwappedRepeatOutcomeName,
  SwappedRepeatUnclearReasonName | null,
][] = [
  ["followsEar", null],
  ["followsEarpiece", null],
  ["unclear", "noLevel"],
  ["unclear", "differenceShrank"],
];

/** A run of the given arrangement with the given wings, its difference as the summary gives it. */
function runOf(
  left: WingWords,
  right: WingWords,
  swapped: boolean,
): ComparisonRunWords {
  const bothFound = left.state === "found" && right.state === "found";
  return {
    left: { ...left, earpiece: swapped ? "right" : "left" },
    right: { ...right, earpiece: swapped ? "left" : "right" },
    rightMinusLeftDb: bothFound
      ? (right.thresholdDb as number) - (left.thresholdDb as number)
      : null,
  };
}

/** Every description: each state of each wing of the repeat against a fixed partner, and each first run level pair, for every outcome. */
function representativeDescriptions(): string[] {
  const found = (thresholdDb: number): WingWords => ({
    state: "found",
    thresholdDb,
    reasons: [],
  });
  const descriptions: string[] = [];
  for (const [outcome, unclearReason] of outcomeCases) {
    for (const wing of wingStates) {
      for (const [left, right] of [
        [wing, found(-20)],
        [found(-20), wing],
      ] as const) {
        descriptions.push(
          comparisonDescription({
            roomId: "stairs",
            frequencyHz: 4000,
            runs: [
              runOf(found(-40), found(-20), false),
              runOf(left, right, true),
            ],
            outcome,
            unclearReason,
          }),
        );
      }
    }
    for (const level of levels) {
      descriptions.push(
        comparisonDescription({
          roomId: "cellar",
          frequencyHz: 500,
          runs: [
            runOf(found(level), found(-35), false),
            runOf(found(-35), found(level), true),
          ],
          outcome,
          unclearReason,
        }),
      );
    }
  }
  for (const roomId of ghostSoundIds) {
    for (const frequencyHz of pitches) {
      descriptions.push(
        comparisonDescription({
          roomId,
          frequencyHz,
          runs: [
            runOf(found(-40), found(-20), false),
            runOf(found(-40), found(-20), true),
          ],
          outcome: "followsEar",
          unclearReason: null,
        }),
      );
    }
  }
  return descriptions;
}

/** Every output of the line functions for the representative inputs. */
function representativeOutputs(): string[] {
  const outputs: string[] = [];
  for (const roomId of ghostSoundIds) {
    for (const frequencyHz of pitches) {
      outputs.push(...readyLines(roomId, frequencyHz));
    }
  }
  for (const ear of sides) {
    for (const frequencyHz of pitches) {
      for (const level of levels) {
        outputs.push(
          swappedCaughtLine(ear, otherSide(ear), frequencyHz, level),
        );
      }
    }
  }
  for (const [outcome, reason] of outcomeCases) {
    outputs.push(...outcomeLines(outcome, reason));
  }
  outputs.push(...representativeDescriptions());
  return outputs;
}

/** What may follow a number of decibels (swapped-repeat design.md, "The copy tests"). */
const decibelEndings = [
  " quieter than your calibration",
  " louder than your calibration",
  " quieter on the left",
  " quieter on the right",
];

/** The numbers of decibels in `text` that are not followed by an allowed form. */
function unlabelledDecibels(text: string): string[] {
  const unlabelled: string[] = [];
  for (const match of text.matchAll(/\d+ dB/g)) {
    const after = text.slice(match.index + match[0].length);
    if (!decibelEndings.some((ending) => after.startsWith(ending))) {
      unlabelled.push(`${match[0]}${after.slice(0, 30)}`);
    }
  }
  return unlabelled;
}

const outputs = representativeOutputs();

describe("the swapped repeat's lines for representative inputs", () => {
  it("has outputs to check", () => {
    expect(outputs.length).toBeGreaterThan(500);
  });

  it("uses no banned term, and is non-empty and trimmed", () => {
    for (const text of outputs) {
      expect(findBannedTerms(text, bannedTerms), text).toEqual([]);
      expect(text.trim(), text).toBe(text);
      expect(text, text).not.toBe("");
    }
  });

  it("labels every number of decibels as relative to the calibration or as a side's difference", () => {
    for (const text of outputs) {
      expect(unlabelledDecibels(text), text).toEqual([]);
    }
  });

  it("ends the lines of followsEar with the professional sentence exactly, and no other outcome holds it", () => {
    const followsEar = outcomeLines("followsEar", null);
    expect(followsEar[followsEar.length - 1]).toBe(professionalSentence);
    for (const [outcome, reason] of outcomeCases) {
      if (outcome === "followsEar") {
        continue;
      }
      for (const line of outcomeLines(outcome, reason)) {
        expect(line).not.toContain(professionalSentence);
      }
    }
  });

  it("says seems in every attribution line", () => {
    for (const outcome of ["followsEar", "followsEarpiece"] as const) {
      const attributions = outcomeLines(outcome, null).filter(
        (line) => line !== professionalSentence,
      );
      expect(attributions.length).toBe(1);
      for (const line of attributions) {
        expect(line).toMatch(/\bseems\b/);
      }
    }
  });

  it("puts the professional sentence in a description exactly for followsEar", () => {
    for (const [outcome, reason] of outcomeCases) {
      const description = comparisonDescription({
        roomId: "stairs",
        frequencyHz: 4000,
        runs: [stairsFirstRun, stairsRepeat],
        outcome,
        unclearReason: reason,
      });
      expect(description.endsWith(professionalSentence)).toBe(
        outcome === "followsEar",
      );
      expect(description.includes(professionalSentence)).toBe(
        outcome === "followsEar",
      );
    }
  });
});
