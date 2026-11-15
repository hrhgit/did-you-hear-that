import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { bannedTerms } from "../../src/config/banned-terms";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { findBannedTerms } from "../../src/copy/find-banned-terms";
import { pitchLabel, roomNames } from "../../src/copy/room-copy";
import type { ReplayPlan } from "../../src/session/missed-sound-replay-plan";
import { missedSoundReplayView } from "../../src/session/missed-sound-replay-view";
import { replaySoundOf } from "../../src/session/replay-sound";
import type {
  MissedSoundReplay,
  ReplayEnding,
  ReplayPauseReason,
  ReplayPhase,
  ReplaySound,
  VisitLog,
} from "../../src/session/visit-flow-types";
import {
  replayScriptArbitrary,
  visitLogArbitrary,
} from "./missed-sound-replay-arbitraries";
import { createReplayHarness } from "./missed-sound-replay-harness";
import type { PlacedReplayText } from "./missed-sound-replay-text";
import {
  accuracyWords,
  blameWords,
  comparisonWords,
  decibelsWithoutSuffix,
  replayEventTexts,
  replayViewTexts,
  wordsIn,
} from "./missed-sound-replay-text";

// CP9. Safe wording (Universal; missed-sound-replay design.md, CP9; R16; wording.md). For a drawn
// visit log and a replay script, every view and event of the run, and a view of each phase made
// directly with every pause reason and every ending: no string has a banned term; every number of
// decibels is a level relative to the calibration or the raise said as a difference; no string
// speaks of accuracy, compares the visitor with anyone or blames them; no string is empty or
// starts or ends with white space; and every string of a sound names only its own room and pitch.
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, "Run counts and time"). */
const runs = 500;
const timeoutMs = 120_000;
/** How long the harness runs on after the script's last entry. */
const tailMs = 60_000;

const pauseReasons: readonly (ReplayPauseReason | null)[] = [
  null,
  "hidden",
  "interrupted",
];
const endings: readonly ReplayEnding[] = [
  "allPlayed",
  "deviceChanged",
  "soundRefused",
];

/** The pitch of every room of both visits. */
const everyRoomFrequencyHz: readonly number[] = [
  ...new Set(Object.values(hearingMethodConfig.roomFrequenciesHz).flat()),
];

/** Matches `phrase` as whole words, in any letter case. */
const asWords = (phrase: string): RegExp =>
  new RegExp(
    `(?<![\\p{L}\\p{N}.])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`,
    "iu",
  );

/** A view of each phase made directly, with every pause reason and every ending that fits the plan. */
function directViews(log: VisitLog, plan: ReplayPlan): MissedSoundReplay[] {
  const sounds: (ReplaySound | null)[] = [null];
  plan.sounds.forEach((planned, index) => {
    // Once as the plan asks it, and once as if the output stage had named a clamp (R4.6).
    sounds.push(
      replaySoundOf(
        planned,
        { playedLevelDb: planned.askedLevelDb, clampLimit: null },
        index + 1,
        plan.sounds.length,
      ),
      replaySoundOf(
        planned,
        { playedLevelDb: planned.askedLevelDb - 1, clampLimit: "ceiling" },
        index + 1,
        plan.sounds.length,
      ),
    );
  });
  const views: MissedSoundReplay[] = [];
  const phases: readonly ReplayPhase[] = [
    "nothingMissed",
    "announcing",
    "playing",
    "finished",
  ];
  for (const phase of phases) {
    for (const current of phase === "playing" || phase === "finished"
      ? sounds
      : [null]) {
      for (const pauseReason of phase === "playing" ? pauseReasons : [null]) {
        for (const ending of phase === "finished" ? endings : [null]) {
          // A replay that played every sound played at least one.
          if (ending === "allPlayed" && plan.sounds.length === 0) {
            continue;
          }
          views.push(
            missedSoundReplayView({
              log,
              plan,
              phase,
              current,
              ending,
              pauseReason,
            }),
          );
        }
      }
    }
  }
  return views;
}

/** The condition of CP9 for one string. */
function expectSafe(placed: PlacedReplayText): void {
  const { place, text, sound } = placed;
  expect(text.length, place).toBeGreaterThan(0);
  expect(text.trim(), place).toBe(text);
  expect(findBannedTerms(text, bannedTerms), place).toEqual([]);
  expect(decibelsWithoutSuffix(text), place).toEqual([]);
  expect(wordsIn(text, accuracyWords), place).toEqual([]);
  expect(wordsIn(text, comparisonWords), place).toEqual([]);
  expect(wordsIn(text, blameWords), place).toEqual([]);
  if (sound === null) {
    return;
  }
  // A sound's strings name only its own room and pitch.
  for (const [roomId, name] of Object.entries(roomNames)) {
    if (roomId !== sound.room.roomId) {
      expect(asWords(name).test(text), `${place} names ${name}`).toBe(false);
    }
  }
  for (const frequencyHz of everyRoomFrequencyHz) {
    if (frequencyHz !== sound.room.frequencyHz) {
      const other = pitchLabel(frequencyHz);
      expect(asWords(other).test(text), `${place} names ${other}`).toBe(false);
    }
  }
}

describe("missed-sound replay CP9: safe wording", () => {
  it(
    "says nothing banned, labels every level relative to the calibration, and never speaks of accuracy, others or blame",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          visitLogArbitrary,
          replayScriptArbitrary,
          async ({ log: drawnLog }, script) => {
            const harness = await createReplayHarness({
              log: drawnLog,
              outputDelayMs: script.outputDelayMs,
            });
            await harness.run(script, tailMs);

            const texts: PlacedReplayText[] = [];
            harness.steps.forEach((step, index) => {
              if (step.view !== null && step.published) {
                texts.push(
                  ...replayViewTexts(step.view, `steps[${String(index)}]`),
                );
              }
            });
            harness.events.forEach((event, index) =>
              texts.push(
                ...replayEventTexts(event.event, `events[${String(index)}]`),
              ),
            );
            directViews(harness.log, harness.controller.plan).forEach(
              (view, index) =>
                texts.push(
                  ...replayViewTexts(view, `direct[${String(index)}]`),
                ),
            );
            expect(texts.length).toBeGreaterThan(0);
            // The verdict depends only on the string and the room of its sound, so each such pair
            // is checked once, at the first place it appears.
            const seen = new Set<string>();
            for (const placed of texts) {
              const key = `${placed.sound?.room.roomId ?? ""}\u0000${placed.text}`;
              if (seen.has(key)) {
                continue;
              }
              seen.add(key);
              expectSafe(placed);
            }
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});
