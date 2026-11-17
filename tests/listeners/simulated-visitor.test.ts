import { describe, expect, it, vi } from "vitest";
import { swappedRepeatCopy } from "../../src/copy/swapped-repeat-copy";
import type { ScoredVisitTrial } from "../../src/session/visit-flow-types";
import { createVisitHarness } from "../properties/visit-flow-harness";
import type { PsychometricListenerParameters } from "./psychometric-listener";
import {
  playVisit,
  type VisitorScript,
  type VisitorSwappedRepeatBehaviour,
} from "./simulated-visitor";

// Worst-case renders keep the visit quick (visit-flow D26, audio-output D43).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } =
    await import("../properties/worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** A Step_Listener: catches every sound at or above its threshold on that side, and nothing else. */
const stepListener: PsychometricListenerParameters = Object.freeze({
  trueThresholdDb: Object.freeze({ left: -32, right: -47 }),
  widthDb: 0,
  lapseFraction: 0,
  falseAlarmFraction: 0,
  wrongSideFraction: 0,
});

const script: VisitorScript = Object.freeze({
  visitType: "quick",
  calibrationTargetDb: -20,
  firstHeadphoneCheckAnswer: "left",
  listener: Object.freeze({
    kind: "psychometric",
    parameters: stepListener,
    seed: 7,
  }),
  visitorSeed: 20261205,
  answerDelayMaxMs: 1500,
  timeStampModes: Object.freeze(["now" as const]),
  restMaxMs: 3000,
  extraPresses: Object.freeze([]),
  disturbances: Object.freeze([]),
  ending: null,
});

describe("playVisit", () => {
  it("plays a quick visit with a Step_Listener to the result, catching only sounds at or above its threshold", async () => {
    const harness = createVisitHarness({
      seed: 20261204,
      performanceOffsetMs: 123_456,
    });
    const run = await playVisit(harness, script);

    expect(run.ending).toBe("done");
    expect(run.finalStage).toBe("result");
    expect(run.presentedTrials.length).toBeGreaterThan(0);

    const scored = harness.events.flatMap((recorded) =>
      recorded.event.kind === "trialScored" ? [recorded.event.trial] : [],
    );
    const caught = scored.filter(
      (trial): trial is Extract<ScoredVisitTrial, { kind: "sound" }> =>
        trial.kind === "sound" && trial.outcome === "caught",
    );
    expect(caught.length).toBeGreaterThan(0);
    for (const trial of caught) {
      expect(trial.requestedLevelDb).toBeGreaterThanOrEqual(
        stepListener.trueThresholdDb[trial.ear],
      );
    }
    // A Step_Listener never answers a silence, and names only the side it heard.
    expect(
      scored.filter(
        (trial) =>
          (trial.kind === "noSound" && trial.outcome === "falseAlarm") ||
          (trial.kind === "sound" && trial.outcome === "wrongSide"),
      ),
    ).toEqual([]);
  });

  it("hears every trial through its headphones: with an imbalance, each ear's sounds are caught at the level its earpiece shifts", async () => {
    // Both true thresholds at −30.5 dB; the right earpiece plays 20 dB quieter than the left, so
    // the left earpiece plays 10 dB louder and the right 10 dB quieter than asked.
    const even: PsychometricListenerParameters = Object.freeze({
      ...stepListener,
      trueThresholdDb: Object.freeze({ left: -30.5, right: -30.5 }),
    });
    const heardThresholdDb = { left: -40.5, right: -20.5 } as const;
    const harness = createVisitHarness({
      seed: 20261206,
      performanceOffsetMs: 4321,
    });
    const run = await playVisit(harness, {
      ...script,
      listener: { kind: "psychometric", parameters: even, seed: 8 },
      headphones: { imbalanceDb: 20 },
    });
    expect(run.ending).toBe("done");
    expect(run.finalStage).toBe("result");

    const sounds = harness.events.flatMap((recorded) =>
      recorded.event.kind === "trialScored" &&
      recorded.event.trial.kind === "sound"
        ? [recorded.event.trial]
        : [],
    );
    expect(sounds.some((trial) => trial.ear === "left")).toBe(true);
    expect(sounds.some((trial) => trial.ear === "right")).toBe(true);
    for (const trial of sounds) {
      if (trial.kind !== "sound") {
        continue;
      }
      expect(
        trial.outcome,
        `${trial.ear} at ${String(trial.requestedLevelDb)} dB`,
      ).toBe(
        trial.requestedLevelDb >= heardThresholdDb[trial.ear]
          ? "caught"
          : "missed",
      );
    }
    // In the rooms of the visit every sound plays in the earpiece of its own ear.
    for (const trial of run.presentedTrials) {
      expect(trial.earpiece).toBe(trial.kind === "sound" ? trial.ear : null);
      expect(trial.swappedRepeatRunNumber).toBeNull();
    }
  });

  // How the visitor moves the calibration control (audible-start R27.2).
  it.each([
    // [control, drags, presses of louder]
    [undefined, [], true],
    ["presses" as const, [], true],
    ["target" as const, [-20], false],
    // Halfway between the bottom of the control, -40 dB, and the setting.
    ["both" as const, [-30], true],
  ])(
    "calibrates by %s: drags %j, presses louder: %s, and keeps its setting",
    async (calibrationControl, drags, presses) => {
      const harness = createVisitHarness({
        seed: 20261209,
        performanceOffsetMs: 5555,
      });
      const run = await playVisit(harness, {
        ...script,
        ...(calibrationControl === undefined ? {} : { calibrationControl }),
      });
      expect(run.ending).toBe("done");
      expect(run.finalStage).toBe("result");
      const final = harness.flow.snapshot();
      if (final.stage !== "result") {
        throw new Error("The visit did not reach its result.");
      }
      expect(
        final.visitLog.calibrations.map((calibration) => calibration.settingDb),
      ).toEqual([script.calibrationTargetDb]);
      expect(
        harness.actions
          .filter((action) => action.name === "setCalibrationTarget")
          .map((action) => action.args[0]),
      ).toEqual(drags);
      expect(harness.actions.some((action) => action.name === "louder")).toBe(
        presses,
      );
      // A drag is made while the hiss plays, never before it has started.
      for (const action of harness.actions) {
        if (action.name === "setCalibrationTarget") {
          expect(action.stageBefore).toBe("calibration");
          expect(action.pausedBefore).toBe(false);
        }
      }
    },
  );

  it.each([
    ["fixture" as const, "music", false],
    ["reject" as const, "hiss", true],
  ])(
    "calibrates with the harness's music %s: the anchor is %s, and repeats are scheduled: %s",
    async (music, anchor, schedulesRepeats) => {
      const harness = createVisitHarness({
        seed: 20261211,
        performanceOffsetMs: 777,
        music,
      });
      const run = await playVisit(harness, script);
      expect(run.ending).toBe("done");
      const final = harness.flow.snapshot();
      if (final.stage !== "result") {
        throw new Error("The visit did not reach its result.");
      }
      expect(final.visitLog.calibrations).toMatchObject([
        { settingDb: script.calibrationTargetDb, anchor },
      ]);
      // The music is a loop of the output stage; the hiss is repeats it schedules.
      const calibrationSchedules = harness.schedules.filter(
        (schedule) => schedule.stage === "calibration",
      );
      expect(calibrationSchedules.length > 0).toBe(schedulesRepeats);
      expect(
        harness.backend
          .loopTimeline()
          .some((call) => call.kind === "startLoop"),
      ).toBe(music === "fixture");
    },
  );

  it("keeps the top of the music's control for a setting above it, as the line at the top says", async () => {
    const harness = createVisitHarness({
      seed: 20261212,
      performanceOffsetMs: 0,
    });
    const run = await playVisit(harness, {
      ...script,
      calibrationTargetDb: -4,
    });
    expect(run.ending).toBe("done");
    const final = harness.flow.snapshot();
    if (final.stage !== "result") {
      throw new Error("The visit did not reach its result.");
    }
    expect(final.visitLog.calibrations).toMatchObject([
      { settingDb: -5, anchor: "music" },
    ]);
  });

  it("drags halfway to a setting off the grid, which the flow rounds down, and presses on from there", async () => {
    const harness = createVisitHarness({
      seed: 20261210,
      performanceOffsetMs: 0,
    });
    const run = await playVisit(harness, {
      ...script,
      calibrationTargetDb: -27,
      calibrationControl: "both",
    });
    expect(run.ending).toBe("done");
    const drags = harness.actions.filter(
      (action) => action.name === "setCalibrationTarget",
    );
    expect(drags.map((action) => action.args[0])).toEqual([-33.5]);
    const final = harness.flow.snapshot();
    if (final.stage !== "result") {
      throw new Error("The visit did not reach its result.");
    }
    expect(final.visitLog.calibrations[0]?.settingDb).toBe(-27);
    // The first press of louder after the drag moves the target from −34, where the flow put it.
    const calibrationSnapshots = harness.snapshots.flatMap((recorded) =>
      recorded.snapshot.stage === "calibration" ? [recorded.snapshot] : [],
    );
    expect(
      calibrationSnapshots.map((snapshot) => snapshot.targetSettingDb),
    ).toContain(-34);
    expect(
      calibrationSnapshots.map((snapshot) => snapshot.targetSettingDb),
    ).not.toContain(-33.5);
  });

  /** A visitor whose ears are 25 dB apart, so that every floor offers the swapped repeat. */
  const uneven: VisitorScript = Object.freeze({
    ...script,
    listener: Object.freeze({
      kind: "psychometric" as const,
      parameters: Object.freeze({
        ...stepListener,
        trueThresholdDb: Object.freeze({ left: -27.5, right: -2.5 }),
      }),
      seed: 9,
    }),
  });

  it("answers the swap check from what it wears: a visitor who does not swap at first hears the hiss on the left", async () => {
    const behaviour: VisitorSwappedRepeatBehaviour = {
      floor: { kind: "firstOffered" },
      swapsOnFirstInstruction: false,
      firstCheckAnswer: "heard",
      pressDelayMaxMs: 1000,
      // Back to the picture once the room has begun, so that the test stays short.
      events: [{ atMs: 60_000, action: "proceed", resumeAfterMs: null }],
      turnsBack: false,
    };
    const harness = createVisitHarness({
      seed: 20261207,
      performanceOffsetMs: 98_765,
    });
    const run = await playVisit(harness, {
      ...uneven,
      swappedRepeat: behaviour,
    });
    expect(run.ending).toBe("done");
    expect(run.finalStage).toBe("result");
    const final = harness.flow.snapshot();
    if (final.stage !== "result") {
      throw new Error("The visit did not come back to its result.");
    }
    const firstOffered = final.summary.rooms.findIndex(
      (room) => room.swappedRepeatOffered,
    );
    expect(firstOffered).toBeGreaterThanOrEqual(0);
    expect(run.swappedRepeatRoomIndex).toBe(firstOffered);

    const checkAnswers = harness.actions
      .filter((action) => action.name === "answerSwapCheck")
      .map((action) => action.args[0]);
    // Not swapped: the hiss of the left earpiece is on the left ear. Then swapped: on the right.
    expect(checkAnswers).toEqual(["left", "right"]);
    expect(
      harness.actions.filter((action) => action.name === "startSwappedRoom"),
    ).toHaveLength(1);
    // The room had begun, with each ear's sounds on the other earpiece.
    const repeated = run.presentedTrials.filter(
      (trial) => trial.swappedRepeatRunNumber !== null,
    );
    expect(repeated.length).toBeGreaterThan(0);
    for (const trial of repeated) {
      expect(trial.swappedRepeatRunNumber).toBe(1);
      expect(trial.earpiece).toBe(
        trial.kind === "sound"
          ? trial.ear === "left"
            ? "right"
            : "left"
          : null,
      );
    }
    // Left before its end: no record, and the line that asks to turn the headphones back.
    expect(final.swappedRepeats).toEqual([]);
    expect(final.turnBackLine).toBe(swappedRepeatCopy.turnBackLine);
  });

  it("stops at the result without a swapped-repeat behaviour, even where a floor offers the repeat", async () => {
    const harness = createVisitHarness({
      seed: 20261208,
      performanceOffsetMs: 0,
    });
    const run = await playVisit(harness, uneven);
    expect(run.ending).toBe("done");
    expect(run.finalStage).toBe("result");
    expect(run.swappedRepeatRoomIndex).toBeNull();
    const final = harness.flow.snapshot();
    if (final.stage !== "result") {
      throw new Error("The visit did not reach its result.");
    }
    expect(final.summary.rooms.some((room) => room.swappedRepeatOffered)).toBe(
      true,
    );
    expect(
      harness.actions.filter((action) => action.name === "chooseSwappedRepeat"),
    ).toEqual([]);
    expect(final.turnBackLine).toBeNull();
  });
});
