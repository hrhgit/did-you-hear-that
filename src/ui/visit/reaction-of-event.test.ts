import { describe, expect, it } from "vitest";
import { practiceCopy } from "../../copy/practice-copy";
import { roomCopy } from "../../copy/room-copy";
import type {
  PracticeSoundScoredEvent,
  ReplaySound,
  ScoredVisitTrial,
  SwappedTrialScoredEvent,
  TrialScoredEvent,
  VisitRoom,
} from "../../session/visit-flow-types";
import { reactionOfEvent } from "./reaction-of-event";

const room: VisitRoom = { roomIndex: 1, roomId: "nursery", frequencyHz: 2000 };

const common = {
  order: 7,
  roomIndex: 1,
  attempt: 1,
  trialNumber: 7,
  gapBeforeMs: 1800,
  presentedAtMs: 40_000,
  windowStartMs: 40_050,
  status: "scored",
  scoredAtMs: 41_000,
} as const;

function soundTrial(
  ear: "left" | "right",
  outcome: ScoredVisitTrial["outcome"],
): ScoredVisitTrial {
  return {
    ...common,
    kind: "sound",
    ear,
    requestedLevelDb: -15,
    playedLevelDb: -15,
    clampLimit: null,
    response: outcome === "caught" ? ear : "none",
    outcome,
    answeredAtMs: outcome === "caught" ? 40_900 : null,
    responseTimeMs: outcome === "caught" ? 850 : null,
  } as ScoredVisitTrial;
}

function scored(
  trial: ScoredVisitTrial,
  reaction: TrialScoredEvent["reaction"],
): TrialScoredEvent {
  return { kind: "trialScored", room, trial, reaction };
}

describe("reactionOfEvent", () => {
  it.each(["left", "right"] as const)(
    "draws a ripple from the %s in the room of a sound that is played again, with no line",
    (ear) => {
      const sound: ReplaySound = {
        position: 2,
        positionLabel: "Sound 2 of 5",
        trialOrder: 31,
        room,
        roomName: "Nursery",
        pitchLabel: "2 kHz",
        ear,
        missedLevelDb: -40,
        raisedLevelDb: -20,
        replayCapDb: -10,
        askedLevelDb: -20,
        playedLevelDb: -20,
        clampLimit: null,
        capChangedLevel: false,
        rippleLabel: "A label that the page shows beside the house.",
      };
      expect(reactionOfEvent({ kind: "replaySoundStarted", sound })).toEqual({
        kind: "replayRipple",
        side: ear,
        roomId: "nursery",
      });
    },
  );

  it.each(["left", "right"] as const)(
    "draws a ripple from the %s for a caught sound, with its pitch and level",
    (ear) => {
      expect(
        reactionOfEvent(scored(soundTrial(ear, "caught"), "ripple")),
      ).toEqual({
        kind: "ripple",
        side: ear,
        line: `You caught it on your ${ear}. 2 kHz, 15 dB quieter than your calibration.`,
      });
    },
  );

  it.each(["missed", "wrongSide"] as const)(
    "shows nothing for a sound that was %s",
    (outcome) => {
      expect(
        reactionOfEvent(scored(soundTrial("left", outcome), "none")),
      ).toBeNull();
    },
  );

  it("says the house's line for an answer to silence", () => {
    const silence = {
      ...common,
      kind: "noSound",
      ear: null,
      requestedLevelDb: null,
      playedLevelDb: null,
      clampLimit: null,
      response: "left",
      outcome: "falseAlarm",
      answeredAtMs: 40_700,
      responseTimeMs: 650,
    } as unknown as ScoredVisitTrial;
    expect(reactionOfEvent(scored(silence, "noSoundLine"))).toEqual({
      kind: "say",
      line: roomCopy.noSoundLine,
    });
  });

  describe("in the room of a swapped repeat", () => {
    const swapped = (
      trial: ScoredVisitTrial,
      reaction: SwappedTrialScoredEvent["reaction"],
      line: string | null,
    ): SwappedTrialScoredEvent => ({
      kind: "swappedTrialScored",
      room,
      runNumber: 1,
      trial: {
        ...trial,
        earpiece:
          trial.kind === "sound"
            ? trial.ear === "left"
              ? "right"
              : "left"
            : null,
      } as unknown as SwappedTrialScoredEvent["trial"],
      reaction,
      line,
    });

    it.each(["left", "right"] as const)(
      "draws a ripple from the %s ear for a caught sound, with the words the event brings",
      (ear) => {
        expect(
          reactionOfEvent(
            swapped(soundTrial(ear, "caught"), "ripple", "The event's words."),
          ),
        ).toEqual({ kind: "ripple", side: ear, line: "The event's words." });
      },
    );

    it("says the line the event brings for an answer to silence", () => {
      const silence = {
        ...common,
        kind: "noSound",
        ear: null,
        response: "left",
        outcome: "falseAlarm",
      } as unknown as ScoredVisitTrial;
      expect(
        reactionOfEvent(swapped(silence, "noSoundLine", "No sound there.")),
      ).toEqual({ kind: "say", line: "No sound there." });
    });

    it.each(["missed", "wrongSide"] as const)(
      "shows nothing for a sound that was %s",
      (outcome) => {
        expect(
          reactionOfEvent(swapped(soundTrial("left", outcome), "none", null)),
        ).toBeNull();
      },
    );

    it("shows nothing without a line, whatever the reaction", () => {
      expect(
        reactionOfEvent(swapped(soundTrial("left", "caught"), "ripple", null)),
      ).toBeNull();
    });
  });

  it("shows nothing when a room starts or finishes", () => {
    expect(
      reactionOfEvent({ kind: "roomStarted", room, attempt: 1 }),
    ).toBeNull();
    expect(reactionOfEvent({ kind: "roomFinished", room })).toBeNull();
  });
});

describe("reactionOfEvent for a practice sound (audible-start, light plan)", () => {
  const practiceEvent = (
    ear: "left" | "right",
    outcome: "caught" | "missed" | "wrongSide",
  ): PracticeSoundScoredEvent => ({
    kind: "practiceSoundScored",
    room,
    trial: {
      order: 1,
      roomIndex: 1,
      attempt: 1,
      round: 1,
      practiceNumber: 1,
      ear,
      requestedLevelDb: 0,
      playedLevelDb: 0,
      clampLimit: null,
      gapBeforeMs: 2000,
      presentedAtMs: 40_000,
      windowStartMs: 40_050,
      status: "scored",
      response:
        outcome === "caught"
          ? ear
          : outcome === "wrongSide"
            ? ear === "left"
              ? "right"
              : "left"
            : "none",
      outcome,
      answeredAtMs: outcome === "missed" ? null : 40_900,
      responseTimeMs: outcome === "missed" ? null : 850,
      scoredAtMs: 41_000,
    },
    reaction: outcome === "caught" ? "ripple" : "none",
    line: outcome === "caught" ? practiceCopy.caughtLine : null,
  });

  it("ripples from the side of a caught practice sound, with its line", () => {
    expect(reactionOfEvent(practiceEvent("right", "caught"))).toEqual({
      kind: "ripple",
      side: "right",
      line: practiceCopy.caughtLine,
    });
  });

  it("shows nothing for a practice sound missed or answered on the other side", () => {
    expect(reactionOfEvent(practiceEvent("left", "missed"))).toBeNull();
    expect(reactionOfEvent(practiceEvent("left", "wrongSide"))).toBeNull();
  });

  it("shows nothing when the counting starts", () => {
    expect(reactionOfEvent({ kind: "countingStarted", room })).toBeNull();
  });
});
