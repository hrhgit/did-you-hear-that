import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../config/hearing-method-config";
import { missedSoundReplayConfig } from "../config/missed-sound-replay-config";
import type { SoundOutcome } from "../engine/search-types";
import type { ReplayPlan } from "./missed-sound-replay-plan";
import { planMissedSoundReplay } from "./missed-sound-replay-plan";
import type { ReplayViewInput } from "./missed-sound-replay-view";
import { missedSoundReplayView } from "./missed-sound-replay-view";
import { replaySoundOf } from "./replay-sound";
import type {
  Ear,
  LoggedRoomAttempt,
  MissedSoundReplay,
  ReplayEnding,
  ReplayPauseReason,
  ReplayPhase,
  ReplaySound,
  VisitLog,
  VisitTrial,
} from "./visit-flow-types";
import { visitRooms } from "./visit-rooms";

// The Replay_View of one moment (missed-sound-replay design.md, "`missedSoundReplayView(input,
// settings)`" and "What each phase accepts"), on hand-built visit logs. Only the fields the plan
// and the counts read carry meaning; the rest are filled with plausible values.

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return true;
  }
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
}

function run(roomIndex: number): LoggedRoomAttempt {
  return {
    roomIndex,
    attempt: 1,
    engineSeed: 100 * roomIndex + 1,
    calibrationIndex: 0,
    searchCapDb: 5,
    startedAtMs: 10_000 * roomIndex,
    endedAtMs: 10_000 * roomIndex + 9000,
    ending: "finished",
    result: null,
  };
}

function sound(
  order: number,
  roomIndex: number,
  ear: Ear,
  outcome: SoundOutcome,
  playedLevelDb = -25,
): VisitTrial {
  const response =
    outcome === "missed"
      ? ("none" as const)
      : outcome === "caught"
        ? ear
        : ear === "left"
          ? ("right" as const)
          : ("left" as const);
  return {
    order,
    roomIndex,
    attempt: 1,
    trialNumber: order,
    gapBeforeMs: 2000,
    presentedAtMs: 3000 * order,
    windowStartMs: 3000 * order + 50,
    kind: "sound",
    ear,
    requestedLevelDb: playedLevelDb,
    playedLevelDb,
    clampLimit: null,
    status: "scored",
    response,
    outcome,
    answeredAtMs: response === "none" ? null : 3000 * order + 600,
    responseTimeMs: response === "none" ? null : 550,
    scoredAtMs: 3000 * order + 600,
  };
}

function noSound(order: number, roomIndex: number): VisitTrial {
  return {
    order,
    roomIndex,
    attempt: 1,
    trialNumber: order,
    gapBeforeMs: 2000,
    presentedAtMs: 3000 * order,
    windowStartMs: 3000 * order + 50,
    kind: "noSound",
    ear: null,
    requestedLevelDb: null,
    playedLevelDb: null,
    clampLimit: null,
    status: "scored",
    response: "none",
    outcome: "noResponse",
    answeredAtMs: null,
    responseTimeMs: null,
    scoredAtMs: 3000 * order + 2000,
  };
}

function makeLog(trials: readonly VisitTrial[]): VisitLog {
  return deepFreeze({
    formatVersion: 1,
    visitType: "quick",
    visitSeed: 42,
    rooms: visitRooms("quick"),
    calibrations: [
      {
        calibrationIndex: 0,
        settingDb: -20,
        roomTopLevelDb: {
          cellar: 5,
          corridor: 5,
          nursery: 5,
          stairs: 5,
          attic: 5,
        },
        keptAtMs: 0,
      },
    ],
    headphoneChecks: [],
    roomAttempts: [run(0), run(1), run(2)],
    trials,
    ignoredAnswers: [],
    pauses: [],
    refusedPlays: [],
  });
}

// Three missed sounds (orders 2, 5 and 6), one wrong side on the left, a no-sound trial.
const log = makeLog([
  sound(1, 0, "left", "caught"),
  sound(2, 0, "right", "missed", -30),
  noSound(3, 0),
  sound(4, 0, "left", "wrongSide"),
  sound(5, 1, "right", "missed", -40),
  sound(6, 1, "left", "missed", -5),
  sound(7, 2, "right", "caught"),
]);

// Nothing missed: one catch and one wrong side.
const caughtLog = makeLog([
  sound(1, 0, "left", "caught"),
  sound(2, 0, "right", "wrongSide"),
]);

const fullPlan = planMissedSoundReplay(log);
const selectionPlan = planMissedSoundReplay(log, {
  capRelativeToAnchorDb: hearingMethodConfig.capRelativeToAnchorDb,
  replayRaiseDb: missedSoundReplayConfig.replayRaiseDb,
  replaySoundsMaxCount: 2,
});

function startedSound(plan: ReplayPlan, index: number): ReplaySound {
  const planned = plan.sounds[index]!;
  return replaySoundOf(
    planned,
    { playedLevelDb: planned.askedLevelDb, clampLimit: null },
    index + 1,
    plan.sounds.length,
  );
}

function viewOf(parts: Partial<ReplayViewInput>): MissedSoundReplay {
  return missedSoundReplayView({
    log,
    plan: fullPlan,
    phase: "announcing",
    current: null,
    ending: null,
    pauseReason: null,
    ...parts,
  });
}

const announcement = [
  "Before you leave, I will play again the sounds you did not catch.",
  "Each one comes from the side where I made it, with its creature in the doorway, in the order I made them.",
  "Each one is 20 dB louder than when it went by, but never louder than the house may play.",
  "Leave the volume as it is. You can stop the sounds at any moment.",
];

const wholeCounts = {
  throughTrialOrder: null,
  left: { madeCount: 3, caughtCount: 1, wrongSideCount: 1, missedCount: 1 },
  right: { madeCount: 3, caughtCount: 1, wrongSideCount: 0, missedCount: 2 },
  leftLine:
    "On your left I made three sounds. You caught one. Once you named the other side.",
  rightLine: "On your right I made three sounds. You caught one.",
};

describe("missedSoundReplayView: each phase", () => {
  it("gives nothingMissed its line, the whole log's counts and the control that goes on", () => {
    const plan = planMissedSoundReplay(caughtLog);
    expect(
      missedSoundReplayView({
        log: caughtLog,
        plan,
        phase: "nothingMissed",
        current: null,
        ending: null,
        pauseReason: null,
      }),
    ).toEqual({
      phase: "nothingMissed",
      heading: "The sounds you did not catch",
      missedSoundCount: 0,
      replaySoundCount: 0,
      selectionLine: null,
      stopLabel: "Stop the sounds",
      line: "You answered every sound I made, so I have nothing to play again.",
      counts: {
        throughTrialOrder: null,
        left: {
          madeCount: 1,
          caughtCount: 1,
          wrongSideCount: 0,
          missedCount: 0,
        },
        right: {
          madeCount: 1,
          caughtCount: 0,
          wrongSideCount: 1,
          missedCount: 0,
        },
        leftLine: "On your left I made one sound. You caught it.",
        rightLine: "On your right I made one sound. You named the other side.",
      },
      canStart: false,
      canSkip: false,
      proceedLabel: "See the picture",
    });
  });

  it("gives announcing the four announcement lines, the start control and skip", () => {
    expect(viewOf({ phase: "announcing" })).toEqual({
      phase: "announcing",
      heading: "The sounds you did not catch",
      missedSoundCount: 3,
      replaySoundCount: 3,
      selectionLine: null,
      stopLabel: "Stop the sounds",
      announcementLines: announcement,
      startLabel: "Play them",
      canStart: true,
      canSkip: true,
      proceedLabel: "Skip them",
    });
  });

  it("names the raise of the settings in the announcement", () => {
    const view = missedSoundReplayView(
      {
        log,
        plan: fullPlan,
        phase: "announcing",
        current: null,
        ending: null,
        pauseReason: null,
      },
      { replayRaiseDb: 15 },
    );
    expect(view.phase === "announcing" && view.announcementLines[2]).toBe(
      "Each one is 15 dB louder than when it went by, but never louder than the house may play.",
    );
  });

  it("gives playing no current sound and no counts before the first sound starts", () => {
    expect(viewOf({ phase: "playing" })).toEqual({
      phase: "playing",
      heading: "The sounds you did not catch",
      missedSoundCount: 3,
      replaySoundCount: 3,
      selectionLine: null,
      stopLabel: "Stop the sounds",
      current: null,
      counts: null,
      pauseLine: null,
      resumeLabel: "Go on",
      canStart: false,
      canSkip: true,
      proceedLabel: "Skip the rest",
    });
  });

  it("gives playing the current sound and the counts through its trial order", () => {
    const current = startedSound(fullPlan, 1);
    expect(current.trialOrder).toBe(5);
    const view = viewOf({ phase: "playing", current });
    expect(view.phase).toBe("playing");
    if (view.phase !== "playing") return;
    expect(view.current).toEqual(current);
    expect(view.counts).toEqual({
      throughTrialOrder: 5,
      left: { madeCount: 2, caughtCount: 1, wrongSideCount: 1, missedCount: 0 },
      right: {
        madeCount: 2,
        caughtCount: 0,
        wrongSideCount: 0,
        missedCount: 2,
      },
      leftLine:
        "On your left I made two sounds. You caught one. Once you named the other side.",
      rightLine: "On your right I made two sounds. You caught none of them.",
    });
  });

  it("counts through the first sound's order when the first sound has started", () => {
    const view = viewOf({
      phase: "playing",
      current: startedSound(fullPlan, 0),
    });
    if (view.phase !== "playing") throw new Error("not playing");
    expect(view.counts?.throughTrialOrder).toBe(2);
    expect(view.counts?.leftLine).toBe(
      "On your left I made one sound. You caught it.",
    );
    expect(view.counts?.rightLine).toBe(
      "On your right I made one sound. You did not catch it.",
    );
  });

  it.each<[ReplayPauseReason, string]>([
    [
      "hidden",
      "The sounds paused while this page was out of sight. When you go on, they carry on where they stopped.",
    ],
    [
      "interrupted",
      "Something else on this device took over the sound, so the sounds paused. When you go on, they carry on where they stopped.",
    ],
  ])(
    "gives playing the pause line of %s, and no skip while the pause holds",
    (pauseReason, pauseLine) => {
      const view = viewOf({
        phase: "playing",
        current: startedSound(fullPlan, 0),
        pauseReason,
      });
      expect(view).toMatchObject({
        phase: "playing",
        pauseLine,
        resumeLabel: "Go on",
        canStart: false,
        canSkip: false,
        proceedLabel: "Skip the rest",
        stopLabel: "Stop the sounds",
      });
    },
  );

  it.each<[ReplayEnding, string]>([
    ["allPlayed", "That was every sound you did not catch."],
    [
      "deviceChanged",
      "Your audio device changed, so I cannot play the sounds again. Your picture is ready.",
    ],
    [
      "soundRefused",
      "The house could not play these sounds on this device, so it stopped them. Your picture is ready.",
    ],
  ])(
    "gives finished with %s its end line, the whole log's counts and the last sound",
    (ending, line) => {
      const last = startedSound(fullPlan, 2);
      expect(viewOf({ phase: "finished", ending, current: last })).toEqual({
        phase: "finished",
        heading: "The sounds you did not catch",
        missedSoundCount: 3,
        replaySoundCount: 3,
        selectionLine: null,
        stopLabel: "Stop the sounds",
        ending,
        endLine: line,
        counts: wholeCounts,
        last,
        canStart: false,
        canSkip: false,
        proceedLabel: "See the picture",
      });
    },
  );

  it("gives finished no last sound when none started", () => {
    const view = viewOf({ phase: "finished", ending: "deviceChanged" });
    expect(view.phase === "finished" && view.last).toBeNull();
  });

  it("ignores a pause reason outside playing", () => {
    expect(viewOf({ phase: "announcing", pauseReason: "hidden" })).toEqual(
      viewOf({ phase: "announcing" }),
    );
    expect(
      viewOf({ phase: "finished", ending: "allPlayed", pauseReason: "hidden" }),
    ).toEqual(viewOf({ phase: "finished", ending: "allPlayed" }));
  });

  it("refuses a finished phase with no ending", () => {
    expect(() => viewOf({ phase: "finished" })).toThrow(RangeError);
  });
});

describe("missedSoundReplayView: the selection", () => {
  const phases: readonly ReplayViewInput[] = [
    {
      log,
      plan: selectionPlan,
      phase: "announcing",
      current: null,
      ending: null,
      pauseReason: null,
    },
    {
      log,
      plan: selectionPlan,
      phase: "playing",
      current: startedSound(selectionPlan, 1),
      ending: null,
      pauseReason: null,
    },
    {
      log,
      plan: selectionPlan,
      phase: "finished",
      current: startedSound(selectionPlan, 1),
      ending: "allPlayed",
      pauseReason: null,
    },
  ];

  it.each(phases)(
    "gives the selection line and both counts in $phase",
    (input) => {
      const view = missedSoundReplayView(input);
      expect(view.selectionLine).toBe(
        "You did not catch three sounds. I will play two of them, spread over the whole visit.",
      );
      expect(view.missedSoundCount).toBe(3);
      expect(view.replaySoundCount).toBe(2);
    },
  );

  it("gives the end line of a selection", () => {
    const view = missedSoundReplayView(phases[2]!);
    expect(view.phase === "finished" && view.endLine).toBe(
      "Those were two of the three sounds you did not catch.",
    );
  });

  it("gives no selection line when every missed sound is played", () => {
    for (const phase of ["announcing", "playing"] as const) {
      expect(viewOf({ phase }).selectionLine).toBeNull();
    }
    expect(
      viewOf({ phase: "finished", ending: "allPlayed" }).selectionLine,
    ).toBeNull();
  });
});

describe("missedSoundReplayView: what every view holds", () => {
  const inputs: readonly ReplayViewInput[] = [
    {
      log: caughtLog,
      plan: planMissedSoundReplay(caughtLog),
      phase: "nothingMissed",
      current: null,
      ending: null,
      pauseReason: null,
    },
    ...(["announcing", "playing"] as const).map((phase): ReplayViewInput => ({
      log,
      plan: fullPlan,
      phase,
      current: null,
      ending: null,
      pauseReason: null,
    })),
    {
      log,
      plan: fullPlan,
      phase: "playing",
      current: startedSound(fullPlan, 0),
      ending: null,
      pauseReason: "interrupted",
    },
    ...(["allPlayed", "deviceChanged", "soundRefused"] as const).map(
      (ending): ReplayViewInput => ({
        log,
        plan: fullPlan,
        phase: "finished",
        current: startedSound(fullPlan, 2),
        ending,
        pauseReason: null,
      }),
    ),
  ];

  it.each(inputs)("gives the stop label in $phase", (input) => {
    expect(missedSoundReplayView(input).stopLabel).toBe("Stop the sounds");
  });

  it.each(inputs)("is deeply frozen in $phase", (input) => {
    expect(isDeeplyFrozen(missedSoundReplayView(input))).toBe(true);
  });

  it.each(inputs)("is equal for equal inputs in $phase", (input) => {
    const copy = JSON.parse(JSON.stringify(input)) as ReplayViewInput;
    expect(missedSoundReplayView(copy)).toEqual(missedSoundReplayView(input));
  });

  it("freezes no object of its input", () => {
    const current = {
      ...startedSound(fullPlan, 0),
      room: { ...fullPlan.sounds[0]!.room },
    };
    missedSoundReplayView({
      log,
      plan: fullPlan,
      phase: "playing",
      current,
      ending: null,
      pauseReason: null,
    });
    expect(Object.isFrozen(current)).toBe(false);
    expect(Object.isFrozen(current.room)).toBe(false);
  });

  it("gives canStart, canSkip and proceedLabel of each phase as the table gives them", () => {
    const rows: [
      ReplayPhase,
      ReplayPauseReason | null,
      boolean,
      boolean,
      string,
    ][] = [
      ["announcing", null, true, true, "Skip them"],
      ["playing", null, false, true, "Skip the rest"],
      ["playing", "hidden", false, false, "Skip the rest"],
      ["finished", null, false, false, "See the picture"],
    ];
    for (const [phase, pauseReason, canStart, canSkip, proceedLabel] of rows) {
      const view = viewOf({
        phase,
        pauseReason,
        ending: phase === "finished" ? "allPlayed" : null,
      });
      expect({ phase, pauseReason, ...pick(view) }).toEqual({
        phase,
        pauseReason,
        canStart,
        canSkip,
        proceedLabel,
      });
    }
    const nothing = missedSoundReplayView(inputs[0]!);
    expect(pick(nothing)).toEqual({
      canStart: false,
      canSkip: false,
      proceedLabel: "See the picture",
    });
  });
});

function pick(view: MissedSoundReplay): {
  canStart: boolean;
  canSkip: boolean;
  proceedLabel: string;
} {
  return {
    canStart: view.canStart,
    canSkip: view.canSkip,
    proceedLabel: view.proceedLabel,
  };
}
