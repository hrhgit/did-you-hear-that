import { describe, expect, it } from "vitest";
import { hearingMethodConfig } from "../../../src/config/hearing-method-config";
import { createSeededRandom } from "../../../src/config/seeded-random";
import {
  swappedRepeatView,
  type SwappedRepeatViewInput,
} from "../../../src/session/swapped-repeat-view";
import type {
  ScoredVisitTrial,
  SnapshotBase,
  SwappedRepeatSnapshot,
  TrialScoredEvent,
  VisitEvent,
  VisitLog,
  VisitRoom,
  VisitSnapshot,
  VisitStage,
  VisitSummary,
} from "../../../src/session/visit-flow-types";
import { guessFromScreen } from "./guess-from-screen";
import {
  createScreenRecorder,
  leakSamples,
  momentsBeforeDecision,
  recordOfLeakyPage,
  type RecordedTrial,
  type ScreenMoment,
  type ScreenRecord,
} from "./screen-record";

const room: VisitRoom = { roomIndex: 0, roomId: "corridor", frequencyHz: 1000 };

function base<Stage extends VisitStage>(stage: Stage): SnapshotBase<Stage> {
  return {
    stage,
    visitType: "full",
    rooms: [room],
    finishedRoomCount: 0,
    canProceed: false,
    pause: null,
    activationRefused: false,
  };
}

const rules: VisitSnapshot = { ...base("rules"), canProceed: true };
const inRoom: VisitSnapshot = { ...base("room"), room };

function decided(
  kind: "sound" | "noSound",
  reaction: TrialScoredEvent["reaction"],
): VisitEvent {
  const trial = {
    order: 1,
    roomIndex: 0,
    attempt: 1,
    trialNumber: 1,
    gapBeforeMs: 2000,
    presentedAtMs: 0,
    windowStartMs: 0,
    status: "scored",
    scoredAtMs: 0,
    kind,
    ...(kind === "sound"
      ? {
          ear: "left",
          requestedLevelDb: -20,
          playedLevelDb: -20,
          clampLimit: null,
          response: reaction === "ripple" ? "left" : "none",
          outcome: reaction === "ripple" ? "caught" : "missed",
        }
      : {
          response: reaction === "noSoundLine" ? "left" : "none",
          outcome: reaction === "noSoundLine" ? "falseAlarm" : "noResponse",
        }),
    answeredAtMs: null,
    responseTimeMs: null,
  } as unknown as ScoredVisitTrial;
  return { kind: "trialScored", room, trial, reaction };
}

describe("createScreenRecorder", () => {
  it("notes a page change only when the derived screen changes, and every reaction", () => {
    let nowMs = 1000;
    const recorder = createScreenRecorder(() => nowMs);
    recorder.snapshot(rules);
    nowMs = 2000;
    recorder.snapshot(inRoom);
    recorder.event({ kind: "roomStarted", room, attempt: 1 });
    nowMs = 4000;
    recorder.presented({
      kind: "sound",
      ear: "left",
      roomIndex: 0,
      attempt: 1,
    });
    // The same screen again, as after a decision that changes nothing visible.
    recorder.snapshot({ ...inRoom });
    nowMs = 4800;
    recorder.event(decided("sound", "ripple"));
    nowMs = 7000;
    recorder.presented({
      kind: "noSound",
      ear: null,
      roomIndex: 0,
      attempt: 1,
    });
    nowMs = 9000;
    recorder.event(decided("noSound", "none"));
    nowMs = 11_000;
    recorder.presented({
      kind: "noSound",
      ear: null,
      roomIndex: 0,
      attempt: 1,
    });
    nowMs = 11_500;
    recorder.event(decided("noSound", "noSoundLine"));

    const record = recorder.record();
    expect(record.moments).toEqual<ScreenMoment[]>([
      { atMs: 1000, what: "screen" },
      { atMs: 2000, what: "screen" },
      { atMs: 4800, what: "ripple" },
      { atMs: 11_500, what: "say" },
    ]);
    expect(record.trials).toEqual<RecordedTrial[]>([
      {
        kind: "sound",
        ear: "left",
        roomIndex: 0,
        attempt: 1,
        anchorMs: 2000,
        presentedAtMs: 4000,
        decidedAtMs: 4800,
      },
      {
        kind: "noSound",
        ear: null,
        roomIndex: 0,
        attempt: 1,
        anchorMs: 4800,
        presentedAtMs: 7000,
        decidedAtMs: 9000,
      },
      {
        kind: "noSound",
        ear: null,
        roomIndex: 0,
        attempt: 1,
        anchorMs: 9000,
        presentedAtMs: 11_000,
        decidedAtMs: 11_500,
      },
    ]);
    for (const trial of record.trials) {
      expect(momentsBeforeDecision(record, trial)).toEqual([]);
    }
  });

  it("keeps only the last presentation of a trial that was cut off and shown again", () => {
    let nowMs = 0;
    const recorder = createScreenRecorder(() => nowMs);
    recorder.event({ kind: "roomStarted", room, attempt: 1 });
    nowMs = 2000;
    recorder.presented({
      kind: "sound",
      ear: "right",
      roomIndex: 0,
      attempt: 1,
    });
    nowMs = 9000;
    recorder.presented({
      kind: "sound",
      ear: "right",
      roomIndex: 0,
      attempt: 1,
    });
    nowMs = 9500;
    recorder.event(decided("sound", "none"));
    expect(recorder.record().trials).toHaveLength(1);
    expect(recorder.record().trials[0]?.presentedAtMs).toBe(9000);
  });

  it("starts the swapped repeat's room from its snapshot and takes its decided trials", () => {
    const counts = {
      presentationCount: 10,
      catchCount: 5,
      wrongSideCount: 0,
      missCount: 5,
    };
    const viewInput: SwappedRepeatViewInput = {
      roomSummary: {
        room,
        left: { ...counts, state: "found", thresholdDb: -40 },
        right: { ...counts, state: "found", thresholdDb: -60 },
        searchCapDb: 0,
        noSoundTrialCount: 0,
        falseAlarmCount: 0,
        rightMinusLeftDb: -20,
        swappedRepeatOffered: true,
      },
      phase: "ready",
      earpieces: "swapped",
      unavailable: null,
      again: false,
      awaitingAnswer: false,
      playRefusal: null,
      judgement: null,
      cut: false,
      runNumber: 1,
      pauseReason: null,
      ending: null,
      record: null,
      floorDb: hearingMethodConfig.floorDb,
    };
    const repeatSnapshot = (
      phase: SwappedRepeatViewInput["phase"],
    ): SwappedRepeatSnapshot => ({
      ...base("swappedRepeat"),
      canProceed: true,
      room,
      visitLog: {} as VisitLog,
      summary: {} as VisitSummary,
      repeat: swappedRepeatView({ ...viewInput, phase }),
    });
    const swappedDecided = (line: string | null): VisitEvent =>
      ({
        kind: "swappedTrialScored",
        room,
        runNumber: 1,
        trial: { kind: "sound", ear: "right", earpiece: "left" },
        reaction: line === null ? "none" : "ripple",
        line,
      }) as unknown as VisitEvent;

    let nowMs = 0;
    const recorder = createScreenRecorder(() => nowMs);
    // The last trial of the visit's rooms, then the result, the sheet of the swap and the check.
    recorder.event({ kind: "roomStarted", room, attempt: 1 });
    nowMs = 1000;
    recorder.event(decided("sound", "none"));
    nowMs = 2000;
    recorder.snapshot(repeatSnapshot("instruction"));
    nowMs = 3000;
    recorder.snapshot(repeatSnapshot("ready"));
    nowMs = 4000;
    recorder.snapshot(repeatSnapshot("room"));
    nowMs = 6000;
    recorder.presented({
      kind: "sound",
      ear: "right",
      roomIndex: 0,
      attempt: 1,
      inSwappedRepeat: true,
    });
    nowMs = 6500;
    recorder.event(swappedDecided("Heard on the right"));
    // Another snapshot of the same room's phase does not start it again.
    recorder.snapshot(repeatSnapshot("room"));
    nowMs = 9000;
    recorder.presented({
      kind: "sound",
      ear: "right",
      roomIndex: 0,
      attempt: 1,
      inSwappedRepeat: true,
    });
    nowMs = 9400;
    recorder.event(swappedDecided(null));

    const record = recorder.record();
    const repeated = record.trials.filter(
      (trial) => trial.inSwappedRepeat === true,
    );
    expect(
      repeated.map(({ anchorMs, presentedAtMs, decidedAtMs }) => ({
        anchorMs,
        presentedAtMs,
        decidedAtMs,
      })),
    ).toEqual([
      { anchorMs: 4000, presentedAtMs: 6000, decidedAtMs: 6500 },
      { anchorMs: 6500, presentedAtMs: 9000, decidedAtMs: 9400 },
    ]);
    expect(record.moments).toContainEqual({ atMs: 6500, what: "ripple" });
    // The sheet of the swap changed the page, but before the room began, not before a decision.
    expect(record.moments.filter((moment) => moment.atMs < 4000)).not.toEqual(
      [],
    );
    for (const trial of repeated) {
      expect(momentsBeforeDecision(record, trial)).toEqual([]);
    }
  });
});

/** A record of a page that draws only at decisions, over trials drawn from `seed`. */
function quietRecord(seed: number, trialCount: number): ScreenRecord {
  const random = createSeededRandom(seed);
  const moments: ScreenMoment[] = [{ atMs: 0, what: "screen" }];
  const trials: RecordedTrial[] = [];
  let anchorMs = 0;
  for (let index = 0; index < trialCount; index += 1) {
    const kind = random.next() < 0.25 ? "noSound" : "sound";
    const ear =
      kind === "sound" ? (random.next() < 0.5 ? "left" : "right") : null;
    const presentedAtMs = anchorMs + 1500 + random.next() * 2500;
    const decidedAtMs = presentedAtMs + 300 + random.next() * 1700;
    trials.push({
      kind,
      ear,
      roomIndex: 0,
      attempt: 1,
      anchorMs,
      presentedAtMs,
      decidedAtMs,
    });
    if (random.next() < 0.5) {
      moments.push({
        atMs: decidedAtMs,
        what: kind === "sound" ? "ripple" : "say",
      });
    }
    anchorMs = decidedAtMs;
  }
  return { moments, trials };
}

const options = (seed: number) => ({
  ambientRandom: createSeededRandom(seed),
  ambientWatchMs: 1500,
});

describe("leakSamples", () => {
  it("counts nothing from the page before a decision when the page draws only at decisions", () => {
    const samples = leakSamples(quietRecord(1, 400), "soundOrNot", options(2));
    expect(samples).toHaveLength(400);
    for (const sample of samples) {
      expect(sample.features.slice(0, 2)).toEqual([0, 0]);
    }
    // The ambient motion does vary, so the predictor has something to try.
    expect(
      new Set(samples.map((sample) => sample.features[2])).size,
    ).toBeGreaterThan(1);
  });

  it("gives a predictor nothing to go on for either question", () => {
    for (const question of ["soundOrNot", "side"] as const) {
      const verdict = guessFromScreen(
        leakSamples(quietRecord(3, 3000), question, options(4)),
        leakSamples(quietRecord(5, 3000), question, options(6)),
      );
      expect(verdict.leaks, question).toBe(false);
    }
  });

  it("uses only trials with a sound for the side", () => {
    const record = quietRecord(7, 200);
    const samples = leakSamples(record, "side", options(8));
    expect(samples).toHaveLength(
      record.trials.filter((trial) => trial.kind === "sound").length,
    );
    expect(new Set(samples.map((sample) => sample.label))).toEqual(
      new Set(["left", "right"]),
    );
  });
});

describe("recordOfLeakyPage", () => {
  it("is caught when the page changes as a sound is presented", () => {
    const leaky = (seed: number): ScreenRecord =>
      recordOfLeakyPage(quietRecord(seed, 3000), (trial) =>
        trial.kind === "sound" ? 1 : 0,
      );
    const verdict = guessFromScreen(
      leakSamples(leaky(9), "soundOrNot", options(10)),
      leakSamples(leaky(11), "soundOrNot", options(12)),
    );
    expect(verdict.leaks).toBe(true);
    expect(verdict.chosenFeatures).toContain(0);
    expect(verdict.accuracy).toBe(1);
  });

  it("is caught when the page changes differently for each side", () => {
    const leaky = (seed: number): ScreenRecord =>
      recordOfLeakyPage(quietRecord(seed, 3000), (trial) =>
        trial.ear === "left" ? 1 : 2,
      );
    const verdict = guessFromScreen(
      leakSamples(leaky(13), "side", options(14)),
      leakSamples(leaky(15), "side", options(16)),
    );
    expect(verdict.leaks).toBe(true);
    expect(verdict.chosenFeatures).toContain(0);
  });
});
