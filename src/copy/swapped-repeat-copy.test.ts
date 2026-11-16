import { describe, expect, it } from "vitest";
import { bannedTerms } from "../config/banned-terms";
import { calibrationCopy } from "./calibration-copy";
import { findBannedTerms } from "./find-banned-terms";
import { headphoneCheckCopy } from "./headphone-check-copy";
import { leavingCopy } from "./leaving-copy";
import { roomCopy } from "./room-copy";
import * as swappedRepeatCopyModule from "./swapped-repeat-copy";
import { swappedRepeatCopy } from "./swapped-repeat-copy";

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
