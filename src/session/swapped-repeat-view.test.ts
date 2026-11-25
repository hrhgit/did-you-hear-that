import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { headphoneCheckCopy } from "../copy/headphone-check-copy";
import { leavingCopy } from "../copy/leaving-copy";
import { differenceLabel } from "../copy/result-lines";
import { roomCopy } from "../copy/room-copy";
import { swappedRepeatCopy } from "../copy/swapped-repeat-copy";
import { readyLines } from "../copy/swapped-repeat-lines";
import { swappedRepeatComparison } from "./swapped-repeat-comparison";
import { swappedRepeatRunOf } from "./swapped-repeat-run";
import type { SwappedRepeatViewInput } from "./swapped-repeat-view";
import { swappedRepeatView } from "./swapped-repeat-view";
import { createVisitLogRecorder } from "./visit-log-recorder";
import type {
  EarpieceState,
  PlayRefusal,
  RoomSummary,
  SwapCheckJudgement,
  SwappedRepeat,
  SwappedRepeatEnding,
  SwappedRepeatPauseReason,
  SwappedRepeatPhase,
  SwappedRepeatRun,
  SwappedRepeatUnavailableReason,
  VisitEarResult,
} from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

// The view of one moment of the swapped repeat (swapped-repeat design.md,
// "`swappedRepeatView(input)`" and "Interface contract"), on a floor of the full visit and a record
// made by swappedRepeatRunOf from a run's own recorder log.

const rooms = visitRooms("full");
const floorDb = hearingMethodConfig.floorDb;

const counts = {
  presentationCount: 10,
  catchCount: 5,
  wrongSideCount: 0,
  missCount: 5,
};

const found = (thresholdDb: number) =>
  ({ ...counts, state: "found", thresholdDb }) as const;

/** The stairs, 4 kHz: 20 dB quieter on the left, so the repeat is offered. */
const roomSummary: RoomSummary = Object.freeze({
  room: rooms[3],
  left: Object.freeze(found(-40)) as VisitEarResult,
  right: Object.freeze(found(-20)) as VisitEarResult,
  searchCapDb: 10,
  noSoundTrialCount: 3,
  falseAlarmCount: 0,
  rightMinusLeftDb: 20,
  swappedRepeatOffered: true,
});

/** A record of the stairs whose repeat came out −45 and −25: the difference stayed with the ears. */
function recordOf(summary: RoomSummary, runNumber = 2): SwappedRepeatRun {
  const recorder = createVisitLogRecorder({
    visitType: "full",
    visitSeed: 1,
    rooms,
    startedAtMs: 0,
  });
  const roomIndex = summary.room.roomIndex;
  recorder.attemptStarted({
    roomIndex,
    engineSeed: 5,
    calibrationIndex: 0,
    searchCapDb: summary.searchCapDb,
    startedAtMs: 1000,
  });
  recorder.attemptEnded({
    roomIndex,
    attempt: 1,
    endedAtMs: 90_000,
    ending: "finished",
    result: {
      left: found(-45),
      right: found(-25),
      noSoundTrialCount: 0,
      falseAlarmCount: 0,
      falseAlarmRateFraction: 0,
      falseAlarmRateAboveLimit: false,
    },
  });
  return swappedRepeatRunOf({
    runNumber,
    runLog: recorder.log(),
    swapChecks: [
      {
        answer: "right",
        judgement: "confirmed",
        earpiece: "left",
        answeredAtMs: 500,
      },
    ],
    firstRun: summary,
  });
}

const record = recordOf(roomSummary);

/** An input with every field at its resting value, then the given ones. */
function inputOf(
  overrides: Partial<SwappedRepeatViewInput> & {
    readonly phase: SwappedRepeatPhase;
  },
): SwappedRepeatViewInput {
  return {
    roomSummary,
    earpieces: "unknown",
    unavailable: null,
    again: false,
    awaitingAnswer: false,
    playRefusal: null,
    judgement: null,
    cut: false,
    runNumber: 2,
    pauseReason: null,
    ending: null,
    record: null,
    floorDb,
    ...overrides,
  };
}

function viewOf<P extends SwappedRepeatPhase>(
  overrides: Partial<SwappedRepeatViewInput> & { readonly phase: P },
): Extract<SwappedRepeat, { phase: P }> {
  const view = swappedRepeatView(inputOf(overrides));
  expect(view.phase).toBe(overrides.phase);
  return view as Extract<SwappedRepeat, { phase: P }>;
}

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

const unavailableReasons: readonly SwappedRepeatUnavailableReason[] = [
  "calibrationGone",
  "calibrationChanged",
];
const pauseReasons: readonly SwappedRepeatPauseReason[] = [
  "visitor",
  "hidden",
  "interrupted",
];
const endings: readonly SwappedRepeatEnding[] = [
  "finished",
  "deviceChanged",
  "soundRefused",
];
const judgements: readonly SwapCheckJudgement[] = [
  "confirmed",
  "notSwapped",
  "bothSides",
  "notHeard",
];
const refusals: readonly PlayRefusal[] = [
  "busy",
  "notRunning",
  "notCalibrated",
  "unsupported",
];
const earpieceStates: readonly EarpieceState[] = [
  "asMarked",
  "swapped",
  "unknown",
];

/** One view of every phase, each with the inputs it requires. */
const everyPhase: readonly SwappedRepeatViewInput[] = [
  inputOf({ phase: "unavailable", unavailable: "calibrationGone" }),
  inputOf({ phase: "instruction" }),
  inputOf({ phase: "check" }),
  inputOf({ phase: "ready", earpieces: "swapped" }),
  inputOf({ phase: "room", earpieces: "swapped" }),
  inputOf({ phase: "finished", ending: "finished", record }),
  inputOf({ phase: "finished", ending: "deviceChanged" }),
];

describe("swappedRepeatView in every phase", () => {
  it.each(everyPhase)(
    "gives the heading, the floor, the first difference, the earpieces, the stop and the back label ($phase)",
    (input) => {
      const view = swappedRepeatView(input);
      expect(view).toMatchObject({
        heading: swappedRepeatCopy.heading,
        roomName: "Scritch",
        pitchLabel: "4 kHz",
        firstDifferenceLabel: differenceLabel(20),
        earpieces: input.earpieces,
        stopLabel: swappedRepeatCopy.stopButton,
        backLabel: swappedRepeatCopy.backButton,
      });
      expect(view.firstDifferenceLabel).toBe("20 dB quieter on the left");
      expect(view.stopLabel).toBe("Stop the sounds");
      expect(view.backLabel).toBe("Back to the picture");
    },
  );

  it.each(earpieceStates)("passes the earpiece state %s on", (earpieces) => {
    for (const input of everyPhase) {
      expect(swappedRepeatView({ ...input, earpieces }).earpieces).toBe(
        earpieces,
      );
    }
  });

  it.each(everyPhase)(
    "is deeply frozen, equal for equal inputs, and leaves its input as it was ($phase)",
    (input) => {
      const before = structuredClone(input);
      const view = swappedRepeatView(input);
      expect(isDeeplyFrozen(view)).toBe(true);
      expect(swappedRepeatView(structuredClone(input))).toEqual(view);
      expect(input).toEqual(before);
      expect(Object.isFrozen(input)).toBe(false);
    },
  );

  it("throws a RangeError for a phase it does not know", () => {
    expect(() =>
      swappedRepeatView(
        inputOf({ phase: "elsewhere" as unknown as SwappedRepeatPhase }),
      ),
    ).toThrow(RangeError);
  });
});

describe("swappedRepeatView in unavailable", () => {
  it.each(unavailableReasons)("gives the reason %s and its line", (reason) => {
    const view = viewOf({ phase: "unavailable", unavailable: reason });
    expect(view.reason).toBe(reason);
    expect(view.line).toBe(swappedRepeatCopy.unavailableLines[reason]);
  });

  it("throws a RangeError without a reason", () => {
    expect(() => swappedRepeatView(inputOf({ phase: "unavailable" }))).toThrow(
      RangeError,
    );
  });
});

describe("swappedRepeatView in instruction", () => {
  it("gives the instruction, with the volume line, and the confirm label", () => {
    const view = viewOf({ phase: "instruction" });
    expect(view.lines).toEqual(swappedRepeatCopy.instructionLines);
    expect(view.lines).toContain(
      "Take the headphones off and put them on the other way round: the left earpiece on your right ear, and the right earpiece on your left ear.",
    );
    expect(view.confirmLabel).toBe("They are swapped");
  });

  it("gives the line that asks again only after a check heard on the left", () => {
    expect(viewOf({ phase: "instruction" }).againLine).toBeNull();
    expect(viewOf({ phase: "instruction", again: true }).againLine).toBe(
      swappedRepeatCopy.againLine,
    );
  });
});

describe("swappedRepeatView in check", () => {
  it("gives the visit's question, its four answers and the play label", () => {
    const view = viewOf({ phase: "check" });
    expect(view.question).toBe(headphoneCheckCopy.question);
    expect(view.answers).toBe(headphoneCheckCopy.answers);
    expect(view.playLabel).toBe(headphoneCheckCopy.playButton);
  });

  it("says whether a played check waits for its answer", () => {
    expect(viewOf({ phase: "check" }).awaitingAnswer).toBe(false);
    expect(
      viewOf({ phase: "check", awaitingAnswer: true }).awaitingAnswer,
    ).toBe(true);
  });

  it.each(refusals)("gives the refusal %s and its line", (playRefusal) => {
    const view = viewOf({ phase: "check", playRefusal });
    expect(view.playRefusal).toBe(playRefusal);
    expect(view.playRefusalLine).toBe(swappedRepeatCopy.playRefusedLine);
  });

  it("gives no refusal and no refusal line without a refusal", () => {
    const view = viewOf({ phase: "check" });
    expect(view.playRefusal).toBeNull();
    expect(view.playRefusalLine).toBeNull();
  });

  it.each(judgements)(
    "gives the judgement %s and its line only when it keeps the visitor in the check",
    (judgement) => {
      const view = viewOf({ phase: "check", judgement });
      if (judgement === "bothSides" || judgement === "notHeard") {
        expect(view.judgement).toBe(judgement);
        expect(view.judgementLine).toBe(
          headphoneCheckCopy.judgementLines[judgement],
        );
      } else {
        expect(view.judgement).toBeNull();
        expect(view.judgementLine).toBeNull();
      }
    },
  );

  it("gives the cut line only after a cut", () => {
    expect(viewOf({ phase: "check" }).cutLine).toBeNull();
    expect(viewOf({ phase: "check", cut: true }).cutLine).toBe(
      "The hiss was cut off. Play the check again.",
    );
  });
});

describe("swappedRepeatView in ready", () => {
  it("gives the confirmed check's line, the ready lines and the start label", () => {
    const view = viewOf({ phase: "ready", earpieces: "swapped" });
    expect(view.judgementLine).toBe(swappedRepeatCopy.judgementLines.confirmed);
    expect(view.lines).toEqual(readyLines("stairs", 4000));
    expect(view.lines[0]).toBe(
      "Scritch, 4 kHz. The room runs again just as it did before.",
    );
    expect(view.startLabel).toBe("Go into the room");
  });
});

describe("swappedRepeatView in room", () => {
  it("gives exactly the answer labels of every other room", () => {
    const view = viewOf({ phase: "room", earpieces: "swapped" });
    expect(view.answers).toBe(roomCopy.answers);
    expect(view.answers).toEqual({
      left: { name: "I heard it on my left", hint: "Left" },
      right: { name: "I heard it on my right", hint: "Right" },
    });
  });

  it("gives the run number, the pause label and the resume label", () => {
    const view = viewOf({ phase: "room", runNumber: 3 });
    expect(view.runNumber).toBe(3);
    expect(view.pauseLabel).toBe(roomCopy.pauseButton);
    expect(view.resumeLabel).toBe(roomCopy.goOnButton);
  });

  it.each(pauseReasons)(
    "gives the pause line of %s only while that pause holds",
    (pauseReason) => {
      expect(viewOf({ phase: "room", pauseReason }).pauseLine).toBe(
        leavingCopy.pauseLines[pauseReason],
      );
    },
  );

  it("gives no pause line while no pause holds", () => {
    expect(viewOf({ phase: "room" }).pauseLine).toBeNull();
  });

  it("without a pause, is the same whatever the other phases' fields hold", () => {
    const resting = swappedRepeatView(
      inputOf({ phase: "room", earpieces: "swapped" }),
    );
    const others: readonly Partial<SwappedRepeatViewInput>[] = [
      { unavailable: "calibrationGone" },
      { again: true },
      { awaitingAnswer: true },
      { playRefusal: "busy" },
      { judgement: "bothSides" },
      { cut: true },
      { ending: "finished", record },
      { ending: "deviceChanged" },
    ];
    for (const other of others) {
      expect(
        swappedRepeatView(
          inputOf({ ...other, phase: "room", earpieces: "swapped" }),
        ),
      ).toEqual(resting);
    }
  });
});

describe("swappedRepeatView in finished", () => {
  it.each(endings)(
    "gives the end line of %s and always the turn-back line",
    (ending) => {
      const view = viewOf({
        phase: "finished",
        ending,
        record: ending === "finished" ? record : null,
      });
      expect(view.ending).toBe(ending);
      expect(view.endLine).toBe(swappedRepeatCopy.endLines[ending]);
      expect(view.turnBackLine).toBe(swappedRepeatCopy.turnBackLine);
    },
  );

  it("gives the Comparison of the record for the ending finished", () => {
    const view = viewOf({ phase: "finished", ending: "finished", record });
    expect(view.comparison).toEqual(
      swappedRepeatComparison(roomSummary, record, floorDb),
    );
    expect(view.comparison?.outcome).toBe("followsEar");
  });

  it("puts the Comparison on the floor's own scale, with the floorDb it is given", () => {
    const view = viewOf({
      phase: "finished",
      ending: "finished",
      record,
      floorDb: floorDb + 10,
    });
    expect(view.comparison).toEqual(
      swappedRepeatComparison(roomSummary, record, floorDb + 10),
    );
  });

  it.each(["deviceChanged", "soundRefused"] as const)(
    "gives no Comparison for the ending %s, even with a record",
    (ending) => {
      expect(
        viewOf({ phase: "finished", ending, record }).comparison,
      ).toBeNull();
    },
  );

  it("throws a RangeError without an ending, or for the ending finished without a record", () => {
    expect(() => swappedRepeatView(inputOf({ phase: "finished" }))).toThrow(
      RangeError,
    );
    expect(() =>
      swappedRepeatView(inputOf({ phase: "finished", ending: "finished" })),
    ).toThrow(RangeError);
  });

  it("throws a RangeError for a record of another floor", () => {
    const otherFloor: RoomSummary = { ...roomSummary, room: rooms[1] };
    expect(() =>
      swappedRepeatView(
        inputOf({
          phase: "finished",
          ending: "finished",
          record: recordOf(otherFloor),
        }),
      ),
    ).toThrow(RangeError);
  });
});
