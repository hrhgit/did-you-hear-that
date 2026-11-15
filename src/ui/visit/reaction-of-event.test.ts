import { describe, expect, it } from "vitest";
import { roomCopy } from "../../copy/room-copy";
import type {
  ScoredVisitTrial,
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

  it("shows nothing when a room starts or finishes", () => {
    expect(
      reactionOfEvent({ kind: "roomStarted", room, attempt: 1 }),
    ).toBeNull();
    expect(reactionOfEvent({ kind: "roomFinished", room })).toBeNull();
  });
});
