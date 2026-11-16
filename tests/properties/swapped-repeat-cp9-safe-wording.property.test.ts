import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { bannedTerms } from "../../src/config/banned-terms";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import type { PlayRefusal } from "../../src/audio/output/create-audio-output";
import type { UnreliableReason } from "../../src/engine/search-types";
import { findBannedTerms } from "../../src/copy/find-banned-terms";
import { limitsStatement } from "../../src/copy/limits-statement";
import { roomNames } from "../../src/copy/room-copy";
import { summarizeVisit } from "../../src/session/summarize-visit";
import { swappedRepeatComparison } from "../../src/session/swapped-repeat-comparison";
import { swappedRepeatRunOf } from "../../src/session/swapped-repeat-run";
import { swappedRepeatView } from "../../src/session/swapped-repeat-view";
import type {
  LoggedEarResult,
  RoomSummary,
  SwapCheckJudgement,
  SwappedRepeat,
  SwappedRepeatComparison,
  SwappedRepeatEnding,
  SwappedRepeatPauseReason,
  SwappedRepeatRun,
  SwappedRepeatUnavailableReason,
  VisitLog,
} from "../../src/session/visit-flow-types";
import { createVisitLogRecorder } from "../../src/session/visit-log-recorder";
import { playRefusals } from "./missed-sound-replay-arbitraries";
import {
  repeatLogCaseArbitrary,
  repeatScriptArbitrary,
} from "./swapped-repeat-arbitraries";
import { createRepeatHarness } from "./swapped-repeat-harness";
import type { PlacedRepeatText } from "./swapped-repeat-text";
import {
  accuracyWords,
  blameWordsIn,
  comparisonTexts,
  comparisonWords,
  decibelsWithoutAllowedForm,
  pitchLabelsIn,
  repeatEventTexts,
  repeatViewTexts,
  turnBackTexts,
  wordsIn,
} from "./swapped-repeat-text";

// CP9. Safe wording (Universal; swapped-repeat design.md, CP9; R18; wording.md). Generated: a
// visit log at the result and a repeat script, played on the repeat harness in half the runs, and
// in every run views and comparisons made directly for every phase, judgement, refusal, pause
// reason, ending, unavailable reason, outcome and unclear reason, and every state of every ear of
// the repeat. For every generated string: no banned term; every "{n} dB" is followed by
// " quieter than your calibration", " louder than your calibration", " quieter on the left" or
// " quieter on the right"; no word about accuracy or certainty; no word that compares the visitor
// with anyone; no word of blame; not empty and without white space at either end; it names only
// its own room and pitch. Every attribution line says "seems" (Q1, decided by the owner on
// 2026-11-15); the lines of `followsEar` hold the limits statement's fourth sentence exactly and
// those of every other outcome do not.
//
// Three exceptions, chosen by the owner's coordinator (the owner has not decided them and may
// reverse them), and no other: `calibrationCopy.keptLine` is not checked for "only"; the visit's
// headphone check line for an answer of both sides, which the swap check reuses word for word
// (`headphoneCheckCopy.judgementLines.bothSides`), is not checked for "only" either (regression
// 1); and a string that is exactly "0 dB" is allowed by the rule on decibels
// (`swapped-repeat-text.ts`).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, "Run counts and time"; Q9, PROPOSED, NOT APPROVED). */
const runs = 500;
const timeoutMs = 120_000;

const professionalSentence = limitsStatement.sentences[3];
const allRoomNames: readonly string[] = Object.values(roomNames);
const { floorDb, upwardStepDb } = hearingMethodConfig;

const unavailableReasons: readonly SwappedRepeatUnavailableReason[] = [
  "calibrationGone",
  "calibrationChanged",
];
const judgements: readonly (SwapCheckJudgement | null)[] = [
  null,
  "confirmed",
  "notSwapped",
  "bothSides",
  "notHeard",
];
const pauseReasons: readonly (SwappedRepeatPauseReason | null)[] = [
  null,
  "visitor",
  "hidden",
  "interrupted",
];
const endings: readonly SwappedRepeatEnding[] = [
  "finished",
  "deviceChanged",
  "soundRefused",
];
const unreliableReasons: readonly UnreliableReason[] = [
  "trialLimit",
  "inconsistentCatch",
  "falseAlarmRate",
];

/** Matches `phrase` as whole words, in any letter case. */
const asWords = (phrase: string): RegExp =>
  new RegExp(
    `(?<![\\p{L}\\p{N}.])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`,
    "iu",
  );
const roomNamePatterns: readonly (readonly [string, RegExp])[] =
  allRoomNames.map((name) => [name, asWords(name)] as const);
const seemsPattern = asWords("seems");

/** One ear of the repeat, in any state the search can give. */
const earResultArbitrary: fc.Arbitrary<LoggedEarResult> = fc.oneof(
  fc
    .integer({ min: Math.ceil(floorDb / upwardStepDb), max: 3 })
    .map((steps) => ({
      presentationCount: 8,
      catchCount: 4,
      wrongSideCount: 0,
      missCount: 4,
      state: "found" as const,
      thresholdDb: steps * upwardStepDb,
    })),
  fc.constant({
    presentationCount: 8,
    catchCount: 8,
    wrongSideCount: 0,
    missCount: 0,
    state: "betterThanFloor" as const,
  }),
  fc.constant({
    presentationCount: 8,
    catchCount: 0,
    wrongSideCount: 0,
    missCount: 8,
    state: "worseThanCap" as const,
  }),
  fc.subarray([...unreliableReasons], { minLength: 1 }).map((reasons) => ({
    presentationCount: 20,
    catchCount: 10,
    wrongSideCount: 0,
    missCount: 10,
    state: "unreliable" as const,
    reasons,
  })),
);

/** A record of the floor whose repeat gave these ears, with no trial. */
function recordOf(
  log: VisitLog,
  firstRun: RoomSummary,
  left: LoggedEarResult,
  right: LoggedEarResult,
): SwappedRepeatRun {
  const recorder = createVisitLogRecorder({
    visitType: log.visitType,
    visitSeed: log.visitSeed,
    rooms: log.rooms,
    startedAtMs: 0,
  });
  const roomIndex = firstRun.room.roomIndex;
  const attempt = recorder.attemptStarted({
    roomIndex,
    engineSeed: 1,
    calibrationIndex: 0,
    searchCapDb: firstRun.searchCapDb,
    startedAtMs: 1000,
  });
  recorder.attemptEnded({
    roomIndex,
    attempt,
    endedAtMs: 2000,
    ending: "finished",
    result: {
      left,
      right,
      noSoundTrialCount: 0,
      falseAlarmCount: 0,
      falseAlarmRateFraction: 0,
      falseAlarmRateAboveLimit: false,
    },
  });
  return swappedRepeatRunOf({
    runNumber: 1,
    runLog: recorder.log(),
    swapChecks: [
      {
        answer: "right",
        judgement: "confirmed",
        earpiece: "left",
        answeredAtMs: 500,
      },
    ],
    firstRun,
  });
}

/** A view of every phase made directly, with every input each phase reads. */
function directViews(
  roomSummary: RoomSummary,
  records: readonly SwappedRepeatRun[],
  refusal: PlayRefusal,
): SwappedRepeat[] {
  const base = {
    roomSummary,
    earpieces: "unknown" as const,
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
    floorDb,
  };
  const views: SwappedRepeat[] = [];
  for (const unavailable of unavailableReasons) {
    views.push(
      swappedRepeatView({ ...base, phase: "unavailable", unavailable }),
    );
  }
  for (const again of [false, true]) {
    views.push(swappedRepeatView({ ...base, phase: "instruction", again }));
  }
  for (const awaitingAnswer of [false, true]) {
    for (const playRefusal of [null, refusal]) {
      for (const judgement of judgements) {
        for (const cut of [false, true]) {
          views.push(
            swappedRepeatView({
              ...base,
              phase: "check",
              awaitingAnswer,
              playRefusal,
              judgement,
              cut,
            }),
          );
        }
      }
    }
  }
  views.push(
    swappedRepeatView({ ...base, phase: "ready", earpieces: "swapped" }),
  );
  for (const pauseReason of pauseReasons) {
    views.push(swappedRepeatView({ ...base, phase: "room", pauseReason }));
  }
  for (const ending of endings) {
    for (const record of ending === "finished" ? records : [null]) {
      views.push(
        swappedRepeatView({ ...base, phase: "finished", ending, record }),
      );
    }
  }
  return views;
}

/** Which rules of CP9 a run checks: every rule but the words of blame, or the words of blame. */
type Rules = "allButBlame" | "blame";

/** The rules a text breaks, by the rules checked, the floor and the text: the checks are pure, so each text is checked once. */
const brokenByText = new Map<string, readonly string[]>();

/** Every rule of CP9 one text breaks, for the floor with this room name and pitch label. */
function rulesBrokenBy(
  rules: Rules,
  text: string,
  own: { readonly roomName: string; readonly pitchLabel: string },
): readonly string[] {
  const key = JSON.stringify([rules, own.roomName, own.pitchLabel, text]);
  const known = brokenByText.get(key);
  if (known !== undefined) {
    return known;
  }
  const broken: string[] = [];
  const add = (rule: string, found: readonly string[]): void => {
    if (found.length > 0) {
      broken.push(`${rule} ${JSON.stringify(found)}`);
    }
  };
  if (rules === "blame") {
    add("words of blame", blameWordsIn(text));
  } else {
    add("empty", text.length === 0 ? [text] : []);
    add("white space at an end", text.trim() === text ? [] : [text]);
    add("banned terms", findBannedTerms(text, bannedTerms));
    add("decibels without an allowed form", decibelsWithoutAllowedForm(text));
    add("words about accuracy", wordsIn(text, accuracyWords));
    add("words of comparison", wordsIn(text, comparisonWords));
    add(
      "other rooms",
      roomNamePatterns
        .filter(
          ([name, pattern]) => name !== own.roomName && pattern.test(text),
        )
        .map(([name]) => name),
    );
    add(
      "other pitches",
      pitchLabelsIn(text).filter((pitch) => pitch !== own.pitchLabel),
    );
  }
  brokenByText.set(key, broken);
  return broken;
}

/**
 * The condition of CP9 for one string of the floor with this room name and pitch label: every rule
 * it breaks, as a line naming the place. Checked without `expect` for each rule, so that thousands
 * of strings per run stay quick; the run then expects the list to be empty.
 */
function unsafeIn(
  rules: Rules,
  placed: PlacedRepeatText,
  own: { readonly roomName: string; readonly pitchLabel: string },
): string[] {
  return rulesBrokenBy(rules, placed.text, own).map(
    (rule) => `${placed.place}: ${rule} in ${JSON.stringify(placed.text)}`,
  );
}

/** The outcome lines of a Comparison: "seems" in every attribution, the professional sentence exactly for followsEar. */
function expectOutcomeLines(comparison: SwappedRepeatComparison): void {
  const lines = comparison.outcomeLines;
  if (comparison.outcome !== "unclear") {
    for (const line of lines) {
      if (line !== professionalSentence) {
        expect(line).toMatch(seemsPattern);
      }
    }
  }
  if (comparison.outcome === "followsEar") {
    expect(lines).toContain(professionalSentence);
    expect(lines.at(-1)).toBe(professionalSentence);
  } else {
    for (const line of lines) {
      expect(line.includes(professionalSentence)).toBe(false);
    }
    expect(comparison.description.includes(professionalSentence)).toBe(false);
  }
}

/** CP9 over its generated inputs, for the given rules. */
async function checkWording(rules: Rules): Promise<void> {
  await fc.assert(
    fc.asyncProperty(
      repeatLogCaseArbitrary,
      repeatScriptArbitrary,
      fc.boolean(),
      fc.array(fc.tuple(earResultArbitrary, earResultArbitrary), {
        minLength: 1,
        maxLength: 6,
      }),
      fc.constantFrom(...playRefusals),
      async (logCase, script, withHarness, ears, refusal) => {
        const broken: string[] = [];
        const summary = summarizeVisit(logCase.log);
        const roomSummary = summary.rooms[logCase.floorIndex]!;
        const own = {
          roomName: roomNames[roomSummary.room.roomId],
          pitchLabel: swappedRepeatView({
            roomSummary,
            phase: "instruction",
            earpieces: "unknown",
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
            floorDb,
          }).pitchLabel,
        };
        const records = ears.map(([left, right]) =>
          recordOf(logCase.log, roomSummary, left, right),
        );
        for (const view of directViews(roomSummary, records, refusal)) {
          for (const placed of repeatViewTexts(view)) {
            broken.push(...unsafeIn(rules, placed, own));
          }
        }
        for (const record of records) {
          const comparison = swappedRepeatComparison(
            roomSummary,
            record,
            floorDb,
          );
          for (const placed of comparisonTexts(comparison)) {
            broken.push(...unsafeIn(rules, placed, own));
          }
          if (rules === "allButBlame") {
            expectOutcomeLines(comparison);
          }
        }
        if (!withHarness) {
          expect(broken).toEqual([]);
          return;
        }
        const harness = await createRepeatHarness({
          logCase,
          outputDelayMs: script.outputDelayMs,
        });
        await harness.run(script);
        for (const step of harness.steps) {
          if (step.view !== null) {
            const visit = harness.visits[step.visitIndex ?? -1]!;
            const room = harness.summary.rooms[visit.floorIndex]!.room;
            const floorOwn = {
              roomName: roomNames[room.roomId],
              pitchLabel: step.view.pitchLabel,
            };
            for (const placed of repeatViewTexts(step.view)) {
              broken.push(...unsafeIn(rules, placed, floorOwn));
            }
            if (
              rules === "allButBlame" &&
              step.view.phase === "finished" &&
              step.view.comparison !== null
            ) {
              expectOutcomeLines(step.view.comparison);
            }
          }
          if (step.result !== null) {
            for (const placed of turnBackTexts(step.result.turnBackLine)) {
              broken.push(...unsafeIn(rules, placed, own));
            }
          }
        }
        for (const { event } of harness.events) {
          for (const placed of repeatEventTexts(event)) {
            broken.push(
              ...unsafeIn(rules, placed, {
                roomName: roomNames[event.room.roomId],
                pitchLabel: own.pitchLabel,
              }),
            );
          }
        }
        expect(broken).toEqual([]);
      },
    ),
    { numRuns: runs },
  );
}

describe("swapped repeat CP9: safe wording", () => {
  it(
    "says nothing banned, labels every level by the calibration, claims nothing, compares no one, says seems in every attribution and names only its own floor",
    () => checkWording("allButBlame"),
    timeoutMs,
  );

  it(
    "blames no one: no word of blame in any string, apart from the word only in calibrationCopy.keptLine and in the reused headphone check line for both sides",
    () => checkWording("blame"),
    timeoutMs,
  );
});
