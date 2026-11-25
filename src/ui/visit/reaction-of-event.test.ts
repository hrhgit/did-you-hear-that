import { describe, expect, it } from "vitest";
import {
  creatureCopy,
  creatureOtherSideLine,
  creatureReminderCaughtLine,
  creatureSlippedLine,
} from "../../copy/creature-copy";
import { practiceCopy } from "../../copy/practice-copy";
import { roomCopy } from "../../copy/room-copy";
import { ghostSoundIds } from "../../config/sound-id";
import type {
  PracticeSoundScoredEvent,
  ReminderSoundScoredEvent,
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
    "draws rings from the %s for a sound that is played again, with its creature and no line",
    (ear) => {
      const sound: ReplaySound = {
        position: 2,
        positionLabel: "Sound 2 of 5",
        trialOrder: 31,
        room,
        roomName: "Tink",
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
    "shows the creature of a caught sound on the %s, and says who, the pitch and the level",
    (ear) => {
      expect(
        reactionOfEvent(scored(soundTrial(ear, "caught"), "ripple")),
      ).toEqual({
        kind: "ripple",
        side: ear,
        roomId: "nursery",
        line: `You caught Tink on your ${ear}. 2 kHz, 15 dB quieter than your calibration.`,
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

  it.each(["left", "right"] as const)(
    "shows a sound that went by on the %s once its trial is scored, and says where",
    (ear) => {
      expect(
        reactionOfEvent(scored(soundTrial(ear, "missed"), "slipped")),
      ).toEqual({
        kind: "slipped",
        side: ear,
        roomId: "nursery",
        line: creatureSlippedLine("nursery", ear),
      });
      expect(
        reactionOfEvent(scored(soundTrial(ear, "wrongSide"), "otherSide")),
      ).toEqual({
        kind: "slipped",
        side: ear,
        roomId: "nursery",
        line: creatureOtherSideLine("nursery", ear),
      });
    },
  );

  it("names the creature of the sound, whichever room the event is for", () => {
    for (const roomId of ghostSoundIds) {
      const event: TrialScoredEvent = {
        kind: "trialScored",
        room: { roomIndex: 0, roomId, frequencyHz: 1000 },
        trial: soundTrial("left", "caught"),
        reaction: "ripple",
      };
      const reaction = reactionOfEvent(event);
      expect(reaction).toMatchObject({ kind: "ripple", roomId });
      expect(
        reaction !== null && "line" in reaction && reaction.line,
      ).toContain(`You caught ${creatureCopy[roomId].name} on your left.`);
    }
  });

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

  it("says that nothing came once a silence that went unanswered is scored (the game layer)", () => {
    const silence = {
      ...common,
      kind: "noSound",
      ear: null,
      requestedLevelDb: null,
      playedLevelDb: null,
      clampLimit: null,
      response: "none",
      outcome: "noResponse",
      answeredAtMs: null,
      responseTimeMs: null,
    } as unknown as ScoredVisitTrial;
    expect(reactionOfEvent(scored(silence, "nothingCame"))).toEqual({
      kind: "say",
      line: roomCopy.nothingCameLine,
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
        ).toEqual({
          kind: "ripple",
          side: ear,
          roomId: "nursery",
          line: "The event's words.",
        });
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

  it("shows nothing when a room starts", () => {
    expect(
      reactionOfEvent({ kind: "roomStarted", room, attempt: 1 }),
    ).toBeNull();
  });

  it("says where a creature went when its search is over, and names no side", () => {
    expect(reactionOfEvent({ kind: "roomFinished", room })).toEqual({
      kind: "gone",
      roomId: "nursery",
      line: "Tink has gone back to the nursery.",
    });
    for (const roomId of ghostSoundIds) {
      const reaction = reactionOfEvent({
        kind: "roomFinished",
        room: { roomIndex: 0, roomId, frequencyHz: 1000 },
      });
      expect(reaction).toMatchObject({ kind: "gone", roomId });
      expect(JSON.stringify(reaction)).not.toMatch(/left|right/i);
    }
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
      roomId: "nursery",
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

describe("reactionOfEvent for a reminder sound (the game layer, 2026-11-17)", () => {
  const reminderEvent = (
    ear: "left" | "right",
    outcome: "caught" | "missed",
  ): ReminderSoundScoredEvent => ({
    kind: "reminderSoundScored",
    room,
    trial: {
      order: 1,
      roomIndex: 1,
      attempt: 1,
      ear,
      requestedLevelDb: -20,
      playedLevelDb: -20,
      clampLimit: null,
      gapBeforeMs: 1000,
      presentedAtMs: 40_000,
      windowStartMs: 40_050,
      status: "scored",
      response: outcome === "caught" ? ear : "none",
      outcome,
      answeredAtMs: outcome === "caught" ? 40_900 : null,
      responseTimeMs: outcome === "caught" ? 850 : null,
      scoredAtMs: 41_000,
    },
    reaction: outcome === "caught" ? "ripple" : "none",
    line:
      outcome === "caught" ? creatureReminderCaughtLine("nursery", ear) : null,
  });

  it("shows the creature of a caught reminder on its side, with its line", () => {
    expect(reactionOfEvent(reminderEvent("left", "caught"))).toEqual({
      kind: "ripple",
      side: "left",
      roomId: "nursery",
      line: creatureReminderCaughtLine("nursery", "left"),
    });
  });

  it("shows nothing for a reminder that went by", () => {
    expect(reactionOfEvent(reminderEvent("right", "missed"))).toBeNull();
  });
});
