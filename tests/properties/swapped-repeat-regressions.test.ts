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
import { swappedRepeatView } from "../../src/session/swapped-repeat-view";
import type { RoomSummary } from "../../src/session/visit-flow-types";
import { blameWordsIn, repeatViewTexts } from "./swapped-repeat-text";

describe("swapped repeat regressions", () => {
  // An expected break, found by task 10 (design.md, "Counterexamples"). The view of the check
  // after an answer of both sides gives the visit's headphone check line for it, reused word for
  // word as the design's copy asks ("The hiss came from one side only. ..."). CP9 checks every
  // string for the word "only" but `calibrationCopy.keptLine`, the exception the owner's
  // coordinator chose on 2026-11-15, which allows no other. Only that choice or other words for
  // the line can remove it, so the case stays `it.fails`, and the blame rule of CP9 is skipped,
  // until one of them is decided. It is the shrunk counterexample's floor: the corridor, 1 kHz,
  // left −50 and right −65, offered, cap 0 dB; the view's other inputs are those of a check that
  // waits for a press.
  it.fails(
    "regression 1: the swap check's line for an answer of both sides holds the word only (CP9, seed 1924221164)",
    () => {
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
      for (const placed of repeatViewTexts(view)) {
        expect(blameWordsIn(placed.text), placed.place).toEqual([]);
      }
    },
  );
});
