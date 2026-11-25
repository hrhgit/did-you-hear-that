import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { audioSafetyConfig } from "../../src/config/audio-safety-config";
import { soundRulesConfig } from "../../src/config/sound-rules-config";
import { decibelsToGain } from "../../src/audio/synth/decibels-to-gain";
import { calibrationSettingTopDb } from "../../src/audio/output/calibration-setting-top";
import type { FakeLoopTimelineEntry } from "../../src/audio/output/fake-audio-backend";
import { gainToDecibels } from "../../src/audio/output/gain-to-decibels";
import { calibrationControlPathArbitrary } from "./audible-start-arbitraries";
import { calibrationMusicFixture } from "./calibration-music-fixture";
import {
  createShellUnderTest,
  resolveMusicLoad,
  type ShellUnderTest,
} from "./output-shell-harness";
import { seedArbitrary } from "./sound-arbitraries";

// audible-start CP6 (design.md, "Correctness properties"; R5, brief property 6). On the output
// shell with the fake backend, the manual timer, a music fixture and a control path: every output
// sample bound, the fixture's peak × the level gain × the fade gain, is at most the ceiling at
// every moment; over any two moments of the recorded automation the level rises by at most
// `calibrationRiseMaxDb × (t2 − t1) / calibrationMusicRisePeriodMs`; every start begins at the
// middle of the control and fades in from exact zero over at least the shortest fade, and every
// stop fades out to exact zero over at least the shortest fade; the music stops at keep, close
// and every stop; both channels are equal; no other sound is scheduled while it plays; the
// Played_Setting never exceeds the Control_Top; a fixture whose Music_Top would be below the
// Keep_Minimum plus the span, a load that fails and a load that takes longer than
// `calibrationMusicLoadMaxMs` give the hiss, whose repeats then play as audio-output CP9 says.

// The shell renders the hiss repeats through the synth; these properties give it the worst-case
// renderers (audio-output D43).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/** Runs (design.md, "Correctness properties", CP6). */
const runs = 300;
/** How long the clocks run on after the last step of a path. */
const afterPathMs = 5_000;
/** The tolerance of a rise in decibels, against rounding only (design.md, CP6). */
const riseToleranceDb = 1e-9;

const {
  calibrationSettingMinDb: bottomDb,
  calibrationSettingStepDb: stepDb,
  calibrationSettingKeepMinDb: keepMinDb,
  calibrationSettingSpanMinDb: spanMinDb,
  calibrationRiseMaxDb,
  calibrationMusicRisePeriodMs,
  calibrationMusicLoadMaxMs,
} = audioOutputConfig;
const { ceilingFraction, fadeMinMs } = audioSafetyConfig;
const hissTopDb = calibrationSettingTopDb();

/** How the music load ends: in time, after the time-out, by failing, or never. */
type MusicLoadOutcome = "resolve" | "late" | "reject" | "never";

const musicArbitrary = fc.record({
  crestDb: fc.double({ min: 3, max: 25, noNaN: true }),
  peakFraction: fc.double({ min: 0.1, max: 1, noNaN: true }),
  sampleRateHz: fc.integer({ min: 22_050, max: 96_000 }),
  load: fc.constantFrom<MusicLoadOutcome>(
    "resolve",
    "resolve",
    "resolve",
    "resolve",
    "late",
    "reject",
    "never",
  ),
});

/**
 * How the clocks move: in chunks of a drawn length, the audio clock running at a drawn rate
 * against the timer's, so that steps of the timer come early and late against the audio clock.
 */
const clockArbitrary = fc.record({
  chunkMs: fc.constantFrom(1, 10, 40, 250),
  audioRate: fc.constantFrom(1, 0.97, 1.03),
});

interface Fixture {
  readonly samples: Float32Array;
  readonly rmsFraction: number;
  readonly peakFraction: number;
}

function fixtureOf(music: {
  crestDb: number;
  peakFraction: number;
  sampleRateHz: number;
}): Fixture {
  const samples = calibrationMusicFixture({
    crestDb: music.crestDb,
    rmsFraction: music.peakFraction / decibelsToGain(music.crestDb),
    sampleRateHz: music.sampleRateHz,
  });
  let sumOfSquares = 0;
  let peakFraction = 0;
  for (const sample of samples) {
    sumOfSquares += sample * sample;
    peakFraction = Math.max(peakFraction, Math.abs(sample));
  }
  return {
    samples,
    rmsFraction: Math.sqrt(sumOfSquares / samples.length),
    peakFraction,
  };
}

/** Music_Level_Gain without the ceiling: the reference RMS at the anchor. */
function levelGainAt(fixture: Fixture, settingDb: number): number {
  return (
    (decibelsToGain(settingDb) * soundRulesConfig.referenceRmsFraction) /
    fixture.rmsFraction
  );
}

/**
 * The Control_Top with this fixture, worked out here from the fixture's own peak: the highest grid
 * setting at which its peak at Music_Level_Gain is within the ceiling, and never above the hiss's.
 */
function expectedControlTopDb(fixture: Fixture): number {
  let topDb = bottomDb;
  while (
    topDb + stepDb <= hissTopDb &&
    fixture.peakFraction * levelGainAt(fixture, topDb + stepDb) <=
      ceilingFraction
  ) {
    topDb += stepDb;
  }
  return topDb;
}

/**
 * Where a calibration sound starts on a control with this top: the middle, rounded down to the grid
 * (calibrationStartSettingDb in the session, the owner's request of 2026-11-18).
 */
function startDbOf(topDb: number): number {
  const middleDb = bottomDb + (topDb - bottomDb) / 2;
  return bottomDb + Math.floor((middleDb - bottomDb) / stepDb + 1e-9) * stepDb;
}

/**
 * Where the first hiss repeat plays for a request: the request held to the hiss control and rounded
 * down to the grid, and the bottom for NaN (nextCalibrationSettingDb, R16.1).
 */
function heldFirstHissDb(requestedDb: number): number {
  if (Number.isNaN(requestedDb)) {
    return bottomDb;
  }
  const heldDb = Math.min(Math.max(requestedDb, bottomDb), hissTopDb);
  return bottomDb + Math.floor((heldDb - bottomDb) / stepDb + 1e-9) * stepDb;
}

/** Moves the clocks forward by `durationMs`, chunk by chunk. */
function runClocks(
  shell: ShellUnderTest,
  clock: { chunkMs: number; audioRate: number },
  durationMs: number,
): void {
  for (let doneMs = 0; doneMs < durationMs; doneMs += clock.chunkMs) {
    const chunkMs = Math.min(clock.chunkMs, durationMs - doneMs);
    shell.backend.advanceClockBy(chunkMs * clock.audioRate);
    shell.timer.advanceBy(chunkMs);
  }
}

/**
 * Rebuilds the music's gain over time from the recorded loop calls and checks it: the ceiling,
 * the rise, the start at the middle with its fade in, the stops with their fade out, equal
 * channels, ramps that never overlap and never begin before their loop, and a level never above
 * the Control_Top. Gives the intervals in which the music sounded, to its last fade's end.
 */
function checkAutomation(
  timeline: readonly FakeLoopTimelineEntry[],
  fixture: Fixture,
  controlTopDb: number,
  startDb: number,
): { startMs: number; endMs: number }[] {
  const intervals: { startMs: number; endMs: number }[] = [];
  let loop: {
    levelGain: number;
    startMs: number;
    lastRampEndMs: number;
    calledAtMs: number;
  } | null = null;
  const topGain = levelGainAt(fixture, controlTopDb);
  for (const entry of timeline) {
    switch (entry.kind) {
      case "startLoop": {
        expect(loop, "a loop started while another played").toBeNull();
        expect(entry.fadeInMs).toBeGreaterThanOrEqual(fadeMinMs);
        expect(entry.startMs).toBeGreaterThanOrEqual(entry.atMs);
        expect(entry.left).toBe(fixture.samples);
        expect(entry.right).toEqual(entry.left);
        expect(entry.levelGain).toBeCloseTo(levelGainAt(fixture, startDb), 15);
        expect(
          gainToDecibels(entry.levelGain / levelGainAt(fixture, startDb)),
        ).toBeLessThanOrEqual(riseToleranceDb);
        expect(fixture.peakFraction * entry.levelGain).toBeLessThanOrEqual(
          ceilingFraction,
        );
        loop = {
          levelGain: entry.levelGain,
          startMs: entry.startMs,
          lastRampEndMs: entry.startMs,
          calledAtMs: entry.atMs,
        };
        break;
      }
      case "rampLoopLevel": {
        expect(loop, "a ramp came with no loop playing").not.toBeNull();
        if (loop === null) {
          break;
        }
        expect(entry.startMs).toBeGreaterThanOrEqual(loop.lastRampEndMs);
        expect(entry.endMs).toBeGreaterThan(entry.startMs);
        const riseDb = gainToDecibels(entry.levelGain / loop.levelGain);
        expect(riseDb).toBeLessThanOrEqual(
          (calibrationRiseMaxDb * (entry.endMs - entry.startMs)) /
            calibrationMusicRisePeriodMs +
            riseToleranceDb,
        );
        expect(fixture.peakFraction * entry.levelGain).toBeLessThanOrEqual(
          ceilingFraction,
        );
        expect(entry.levelGain).toBeLessThanOrEqual(topGain * (1 + 1e-12));
        loop.levelGain = entry.levelGain;
        loop.lastRampEndMs = entry.endMs;
        break;
      }
      case "stopLoop":
      case "fadeToSilence": {
        const fadeMs =
          entry.kind === "stopLoop" ? entry.fadeOutMs : entry.durationMs;
        expect(fadeMs).toBeGreaterThanOrEqual(fadeMinMs);
        if (entry.kind === "stopLoop") {
          expect(loop, "a stop came with no loop playing").not.toBeNull();
        }
        if (loop !== null) {
          intervals.push({
            startMs: loop.calledAtMs,
            endMs: entry.atMs + fadeMs,
          });
          loop = null;
        }
        break;
      }
    }
  }
  if (loop !== null) {
    intervals.push({
      startMs: loop.calledAtMs,
      endMs: Number.POSITIVE_INFINITY,
    });
  }
  return intervals;
}

describe("audible-start CP6. The music is safe (Universal; R5, brief property 6)", () => {
  it("stays within the ceiling, rises by at most the configured rise from where it starts, fades in and out, stops on every stop and plays alone; the hiss where it cannot be used", async () => {
    await fc.assert(
      fc.asyncProperty(
        seedArbitrary,
        musicArbitrary,
        clockArbitrary,
        calibrationControlPathArbitrary([
          "start",
          "keep",
          "close",
          "resume",
          "stopAll",
          "hidden",
          "interrupted",
          "deviceChanged",
          "pageLeft",
        ]),
        async (seed, music, clock, path) => {
          const fixture = fixtureOf(music);
          const shell = createShellUnderTest({
            seed,
            sampleRateHz: music.sampleRateHz,
            calibrationMusic: { mode: "pending" },
          });
          const { output, backend } = shell;
          const steps: number[] = [];
          output.onCalibrationMusicStep((settingDb) => steps.push(settingDb));

          await output.activate();
          if (music.load === "resolve") {
            await resolveMusicLoad(shell, fixture.samples);
          } else if (music.load === "reject") {
            backend.rejectCalibrationMusic();
            await resolveMusicLoad(shell, fixture.samples);
          } else {
            runClocks(shell, clock, calibrationMusicLoadMaxMs);
            if (music.load === "late") {
              await resolveMusicLoad(shell, fixture.samples);
            }
          }

          const controlTopDb = expectedControlTopDb(fixture);
          const usable =
            music.load === "resolve" && controlTopDb >= keepMinDb + spanMinDb;
          expect(output.calibrationSound()).toBe(usable ? "music" : "hiss");
          expect(output.calibrationControlTopDb()).toBe(
            usable ? controlTopDb : hissTopDb,
          );
          // The session starts each sound in the middle of its control.
          const startDb = startDbOf(controlTopDb);
          const hissStartDb = startDbOf(hissTopDb);

          // The hiss repeats, as audio-output CP9 says.
          let previousRepeatDb: number | null = null;
          let elapsedMs = 0;
          for (const step of path) {
            runClocks(shell, clock, step.atMs - elapsedMs);
            elapsedMs = step.atMs;
            const wasPlaying = output.calibrationMusicSettingDb() !== null;
            const nowMs = backend.currentTimeMs();
            switch (step.kind) {
              case "target":
                output.setCalibrationMusicTarget(step.settingDb);
                break;
              case "start":
                output.beginCalibration();
                previousRepeatDb = null;
                if (usable) {
                  const started = output.startCalibrationMusic(startDb);
                  if (started.kind === "started") {
                    expect(started.settingDb).toBe(startDb);
                  }
                } else {
                  expect(output.startCalibrationMusic().kind).toBe("refused");
                }
                break;
              case "keep": {
                const kept = output.keepCalibration();
                if (kept.kind === "kept") {
                  expect(kept.settingDb).toBeGreaterThanOrEqual(keepMinDb);
                  expect(kept.settingDb).toBeLessThanOrEqual(
                    usable ? controlTopDb : hissTopDb,
                  );
                  expect(
                    Number.isInteger((kept.settingDb - bottomDb) / stepDb),
                  ).toBe(true);
                  previousRepeatDb = null;
                }
                if (wasPlaying && kept.kind === "kept") {
                  expect(output.calibrationMusicSettingDb()).toBeNull();
                  expect(backend.loopTimeline().at(-1)).toMatchObject({
                    kind: "stopLoop",
                    atMs: nowMs,
                  });
                }
                break;
              }
              case "close":
                output.stopCalibrationMusic();
                if (wasPlaying) {
                  expect(backend.loopTimeline().at(-1)).toMatchObject({
                    kind: "stopLoop",
                    atMs: nowMs,
                  });
                }
                break;
              case "resume":
                await output.activate();
                break;
              case "stopAll":
                output.stopAll();
                break;
              case "hidden":
              case "interrupted":
              case "deviceChanged":
              case "pageLeft":
                backend.fire(step.kind);
                break;
              default:
                throw new Error(
                  `The path has a step it should not: ${step.kind}.`,
                );
            }
            if (
              wasPlaying &&
              [
                "stopAll",
                "hidden",
                "interrupted",
                "deviceChanged",
                "pageLeft",
              ].includes(step.kind)
            ) {
              expect(output.calibrationMusicSettingDb()).toBeNull();
              expect(backend.loopTimeline().at(-1)).toMatchObject({
                kind: "fadeToSilence",
                atMs: nowMs,
              });
            }

            if (output.calibrationMusicSettingDb() !== null) {
              // Nothing else may play while the music does.
              expect(
                output.playCalibrationRepeat({
                  requestedSettingDb: bottomDb,
                  random: shell.random,
                }).kind,
              ).toBe("refused");
              expect(output.playHeadphoneCheck(shell.random).kind).toBe(
                "refused",
              );
              expect(
                output.play({
                  soundId: "cellar",
                  ear: "left",
                  levelDb: 0,
                  purpose: "trial",
                  random: shell.random,
                }).kind,
              ).toBe("refused");
            } else if (!usable && step.kind !== "keep") {
              // The session asks for the start at the start and for the target otherwise.
              const requestedSettingDb =
                step.kind === "target"
                  ? step.settingDb
                  : step.kind === "start"
                    ? hissStartDb
                    : hissTopDb;
              const repeat = output.playCalibrationRepeat({
                requestedSettingDb,
                random: shell.random,
              });
              if (repeat.kind === "scheduled") {
                if (previousRepeatDb === null) {
                  expect(repeat.settingDb).toBe(
                    heldFirstHissDb(requestedSettingDb),
                  );
                } else {
                  expect(repeat.settingDb).toBeLessThanOrEqual(
                    previousRepeatDb + calibrationRiseMaxDb,
                  );
                }
                expect(
                  Number.isInteger((repeat.settingDb - bottomDb) / stepDb),
                ).toBe(true);
                expect(repeat.settingDb).toBeLessThanOrEqual(hissTopDb);
                previousRepeatDb = repeat.settingDb;
              }
            }
            const playedDb = output.calibrationMusicSettingDb();
            if (playedDb !== null) {
              expect(playedDb).toBeGreaterThanOrEqual(bottomDb);
              expect(playedDb).toBeLessThanOrEqual(controlTopDb);
            }
          }
          runClocks(shell, clock, afterPathMs);

          for (const settingDb of steps) {
            expect(settingDb).toBeLessThanOrEqual(controlTopDb);
          }
          const intervals = checkAutomation(
            backend.loopTimeline(),
            fixture,
            controlTopDb,
            startDb,
          );
          if (!usable) {
            expect(intervals).toEqual([]);
          }
          for (const sound of backend.scheduled()) {
            const endMs =
              sound.startMs + (sound.left.length / sound.sampleRateHz) * 1000;
            for (const interval of intervals) {
              expect(
                endMs <= interval.startMs || sound.startMs >= interval.endMs,
                `a sound from ${sound.startMs} to ${endMs} ms played with the music from ${interval.startMs} to ${interval.endMs} ms`,
              ).toBe(true);
            }
          }
          if (usable) {
            // At every setting up to the Music_Top the ceiling never has to act.
            expect(output.clampLog()).toEqual([]);
          }
        },
      ),
      { numRuns: runs },
    );
  }, 120_000);
});
