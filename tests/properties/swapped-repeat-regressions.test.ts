// Regression cases for counterexamples the swapped repeat's properties find (R20.5, design.md,
// "Counterexamples").
//
// Naming: each case is called `regression <n>: <what went wrong> (<property>, seed <s>)`, with
// <n> counting from 1 in the order the cases were found and <s> the fast-check seed (and path)
// that found it. The case writes out the input fast-check printed (the ear difference and the
// imbalance with the base level, the cap and the seeds, the ear results and settings, the visit
// log, the repeat script or the refusal script), runs that one case without fast-check, and
// asserts the property's condition for it alone.
//
// The `it.fails` rule: a case is first committed on its own as `it.fails`, which records that the
// code currently breaks it while keeping `npm test` green. The commit that changes the code turns
// it into an ordinary `it`. A case that could only be removed by changing a steering value, or a
// choice that is the owner's (Q1 to Q10), stays `it.fails` and is reported with the question it
// belongs to. A counterexample of CP1 is not evidence against Q1, which the owner decided on
// 2026-11-15; it is a fault of the code or of the oracle, and is reported with the case.
//
// A case where the property was wrong and the code was right is an ordinary `it` from the start,
// because the code passes it: it asserts the corrected condition for the input that showed the
// fault, so that the property cannot slip back to the wrong check.

import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { headphoneCheckCopy } from "../../src/copy/headphone-check-copy";
import { swappedRepeatView } from "../../src/session/swapped-repeat-view";
import type { RoomSummary } from "../../src/session/visit-flow-types";
import { blameWordsIn, repeatViewTexts } from "./swapped-repeat-text";

describe("swapped repeat regressions", () => {
  // Found by task 10 as an expected break (design.md, "Counterexamples"). The view of the check
  // after an answer of both sides gives the visit's headphone check line for it, reused word for
  // word as the design's copy asks ("The hiss came from one side only. ..."), and CP9 checked it
  // for the word "only". The owner's coordinator then chose a third exception to CP9 (the owner has
  // not decided it and may reverse it): a string that is exactly that line is not checked for
  // "only", for the same reason as `calibrationCopy.keptLine`, because it is another spec's line,
  // reused word for word and checked by its own spec. No other exception. So the statement of the
  // property was what changed, and the case asserts the corrected condition for the input that
  // showed it: the view holds that line exactly, no string of the view holds a word of blame under
  // the corrected rule, and a string that is not exactly one of the two excepted lines is still
  // checked for "only". It is the shrunk counterexample's floor: the corridor, 1 kHz, left −50 and
  // right −65, offered, cap 0 dB; the view's other inputs are those of a check that waits for a
  // press.
  it("regression 1: the swap check's line for an answer of both sides holds the word only (CP9, seed 1924221164)", () => {
    const counts = {
      presentationCount: 10,
      catchCount: 5,
      wrongSideCount: 0,
      missCount: 5,
    };
    const roomSummary: RoomSummary = {
      room: { roomIndex: 0, roomId: "corridor", frequencyHz: 1000 },
      left: { ...counts, state: "found", thresholdDb: -50 },
      right: { ...counts, state: "found", thresholdDb: -65 },
      searchCapDb: 0,
      noSoundTrialCount: 0,
      falseAlarmCount: 0,
      rightMinusLeftDb: -15,
      swappedRepeatOffered: true,
    };
    const view = swappedRepeatView({
      roomSummary,
      phase: "check",
      earpieces: "unknown",
      unavailable: null,
      again: false,
      awaitingAnswer: false,
      playRefusal: null,
      judgement: "bothSides",
      cut: false,
      runNumber: 1,
      pauseReason: null,
      ending: null,
      record: null,
      floorDb: hearingMethodConfig.floorDb,
    });
    if (view.phase !== "check") {
      throw new Error(`Expected the phase check, but got ${view.phase}.`);
    }
    expect(view.judgementLine).toBe(
      headphoneCheckCopy.judgementLines.bothSides,
    );
    for (const placed of repeatViewTexts(view)) {
      expect(blameWordsIn(placed.text), placed.place).toEqual([]);
    }
    expect(blameWordsIn(`${view.judgementLine} Again.`)).toEqual(["only"]);
    expect(blameWordsIn("The hiss came from one side only.")).toEqual(["only"]);
  });
});
