import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { planMissedSoundReplay } from "../../src/session/missed-sound-replay-plan";
import { replayCounts } from "../../src/session/replay-counts";
import type {
  Ear,
  ReplayCounts,
  ReplaySideCounts,
  VisitLog,
} from "../../src/session/visit-flow-types";
import { sideCountLine } from "../../src/copy/replay-lines";
import {
  replayScriptArbitrary,
  visitLogArbitrary,
} from "./missed-sound-replay-arbitraries";
import { createReplayHarness } from "./missed-sound-replay-harness";

// CP2. The counts in the text equal the counts in the log (Universal; missed-sound-replay
// design.md, CP2; R8; brief property 2). For a drawn visit log and a through-order drawn from
// null, every order of the log, 0 and an order past the last: `replayCounts` equals a count over
// the log written here, made equals caught plus wrong side plus missed, and the numbers in each
// side's line, read back by a parser that knows the English number words without `countWords`,
// are those counts and nothing else; at null the missed counts add up to the plan's missed sounds.
// The same log is then replayed with a drawn script on the replay harness, and every view of
// `finished` and `nothingMissed` gives the whole log's counts, and every view of `playing` with a
// current sound gives the counts through that sound's trial order.
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, "Run counts and time"). */
const runs = 1000;
const timeoutMs = 120_000;
/** How long the harness runs on after the script's last entry. */
const tailMs = 60_000;

const ears: readonly Ear[] = ["left", "right"];

/** R8.4, R8.5: the scored sound trials of finished runs up to `through`, by outcome, written from R8. */
function oracleCounts(
  log: VisitLog,
  through: number | null,
): Record<Ear, ReplaySideCounts> {
  const counts = {
    left: { madeCount: 0, caughtCount: 0, wrongSideCount: 0, missedCount: 0 },
    right: { madeCount: 0, caughtCount: 0, wrongSideCount: 0, missedCount: 0 },
  };
  for (const trial of log.trials) {
    if (trial.kind !== "sound" || trial.status !== "scored") {
      continue;
    }
    if (through !== null && trial.order > through) {
      continue;
    }
    const run = log.roomAttempts.find(
      (attempt) =>
        attempt.roomIndex === trial.roomIndex &&
        attempt.attempt === trial.attempt,
    );
    if (run?.ending !== "finished") {
      continue;
    }
    const side = counts[trial.ear];
    side.madeCount += 1;
    if (trial.outcome === "caught") {
      side.caughtCount += 1;
    } else if (trial.outcome === "wrongSide") {
      side.wrongSideCount += 1;
    } else {
      side.missedCount += 1;
    }
  }
  return counts;
}

// ─── A reader of English number words, written without `countWords` ─────────────────────

const smallNumbers: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const tensNumbers: Readonly<Record<string, number>> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** A number below one hundred: "seven", "forty", "fifty-six". */
function belowHundred(words: string): number {
  if (words in smallNumbers) {
    return smallNumbers[words]!;
  }
  if (words in tensNumbers) {
    return tensNumbers[words]!;
  }
  const [tens, units] = words.split("-");
  const unit = units === undefined ? undefined : smallNumbers[units];
  if (
    tens === undefined ||
    !(tens in tensNumbers) ||
    unit === undefined ||
    unit < 1 ||
    unit > 9
  ) {
    throw new Error(`Not a number below one hundred: "${words}".`);
  }
  return tensNumbers[tens]! + unit;
}

/** A count as the house writes it: words up to 999, digits from 1000 on. */
function readCount(words: string): number {
  if (/^\d+$/.test(words)) {
    const count = Number(words);
    if (count < 1000) {
      throw new Error(`A count below 1000 in digits: "${words}".`);
    }
    return count;
  }
  const hundred = /^([a-z]+) hundred(?: and ([a-z-]+))?$/.exec(words);
  if (hundred !== null) {
    const hundreds = smallNumbers[hundred[1]!];
    if (hundreds === undefined || hundreds < 1 || hundreds > 9) {
      throw new Error(`Not a number of hundreds: "${words}".`);
    }
    const rest = hundred[2] === undefined ? 0 : belowHundred(hundred[2]);
    if (hundred[2] !== undefined && rest === 0) {
      throw new Error(`"and zero" is not written: "${words}".`);
    }
    return hundreds * 100 + rest;
  }
  return belowHundred(words);
}

/** The numbers a side's line says: made, caught and named the other side. */
function readSideLine(
  line: string,
  side: Ear,
): { made: number; caught: number; wrongSide: number } {
  if (line === `I have not made a sound on your ${side} yet.`) {
    return { made: 0, caught: 0, wrongSide: 0 };
  }
  const one = new RegExp(
    `^On your ${side} I made one sound\\. (You caught it|You did not catch it|You named the other side)\\.$`,
  ).exec(line);
  if (one !== null) {
    return {
      made: 1,
      caught: one[1] === "You caught it" ? 1 : 0,
      wrongSide: one[1] === "You named the other side" ? 1 : 0,
    };
  }
  const many = new RegExp(
    `^On your ${side} I made ([a-z0-9 -]+) sounds\\. You caught (every one|none of them|[a-z0-9 -]+)\\.(?: (Once|[A-Za-z0-9 -]+ times) you named the other side\\.)?$`,
  ).exec(line);
  if (many === null) {
    throw new Error(`Not a count line of the ${side}: "${line}".`);
  }
  const made = readCount(many[1]!);
  if (made < 2) {
    throw new Error(`"sounds" with fewer than two: "${line}".`);
  }
  const caughtWords = many[2]!;
  const caught =
    caughtWords === "every one"
      ? made
      : caughtWords === "none of them"
        ? 0
        : readCount(caughtWords);
  const wrongWords = many[3];
  const wrongSide =
    wrongWords === undefined
      ? 0
      : wrongWords === "Once"
        ? 1
        : readCount(wrongWords.replace(/ times$/, "").toLowerCase());
  if (wrongWords !== undefined && wrongWords !== "Once" && wrongSide < 2) {
    throw new Error(`"times" with fewer than two: "${line}".`);
  }
  return { made, caught, wrongSide };
}

/** Checks the counts and the lines of a view against the log through an order. */
function expectCountsOf(
  counts: ReplayCounts,
  log: VisitLog,
  through: number | null,
): void {
  expect(counts.throughTrialOrder).toBe(through);
  const oracle = oracleCounts(log, through);
  expect({ left: counts.left, right: counts.right }).toEqual(oracle);
  for (const ear of ears) {
    const line = ear === "left" ? counts.leftLine : counts.rightLine;
    expect(readSideLine(line, ear)).toEqual({
      made: oracle[ear].madeCount,
      caught: oracle[ear].caughtCount,
      wrongSide: oracle[ear].wrongSideCount,
    });
  }
}

const throughOrderOf = (log: VisitLog): fc.Arbitrary<number | null> => {
  const lastOrder = log.trials.at(-1)?.order ?? 0;
  return fc.oneof(
    fc.constant(null),
    fc.constant(0),
    fc.constant(lastOrder + 1),
    ...(lastOrder > 0 ? [fc.integer({ min: 1, max: lastOrder })] : []),
  );
};

describe("missed-sound replay CP2: the counts in the text equal the counts in the log", () => {
  it(
    "counts each side as the log does, and its line says those counts and nothing else, in every view of a replay",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          visitLogArbitrary.chain((drawn) =>
            fc.tuple(fc.constant(drawn), throughOrderOf(drawn.log)),
          ),
          replayScriptArbitrary,
          async ([{ log: drawnLog }, through], script) => {
            // replayCounts and the lines, against the log.
            const counts = replayCounts(drawnLog, through);
            const oracle = oracleCounts(drawnLog, through);
            expect(counts).toEqual(oracle);
            for (const ear of ears) {
              const side = counts[ear];
              expect(side.madeCount).toBe(
                side.caughtCount + side.wrongSideCount + side.missedCount,
              );
              expect(
                readSideLine(
                  sideCountLine(
                    ear,
                    side.madeCount,
                    side.caughtCount,
                    side.wrongSideCount,
                  ),
                  ear,
                ),
              ).toEqual({
                made: side.madeCount,
                caught: side.caughtCount,
                wrongSide: side.wrongSideCount,
              });
            }
            const whole = replayCounts(drawnLog, null);
            expect(whole.left.missedCount + whole.right.missedCount).toBe(
              planMissedSoundReplay(drawnLog).missedSounds.length,
            );

            // The views of a replay of the same log.
            const harness = await createReplayHarness({
              log: drawnLog,
              outputDelayMs: script.outputDelayMs,
            });
            await harness.run(script, tailMs);
            for (const step of harness.steps) {
              const view = step.view;
              if (view === null || view.phase === "announcing") {
                continue;
              }
              if (view.phase === "playing") {
                if (view.current === null) {
                  expect(view.counts).toBeNull();
                } else {
                  expect(view.counts).not.toBeNull();
                  expectCountsOf(
                    view.counts!,
                    harness.log,
                    view.current.trialOrder,
                  );
                }
                continue;
              }
              expectCountsOf(view.counts, harness.log, null);
            }
          },
        ),
        { numRuns: runs },
      );
    },
    timeoutMs,
  );
});
