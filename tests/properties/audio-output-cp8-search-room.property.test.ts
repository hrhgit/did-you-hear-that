import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { hearingMethodConfig } from "../../src/config/hearing-method-config";
import { createSeededRandom } from "../../src/config/seeded-random";
import type { GhostSoundId } from "../../src/config/sound-id";
import { ghostSoundIds } from "../../src/config/sound-id";
import { calibrationSettingTopDb } from "../../src/audio/output/calibration-setting-top";
import { createThresholdSearch } from "../../src/engine/threshold-search";
import type { VisitorResponse } from "../../src/engine/search-types";
import { roomSearchCapDb } from "../../src/session/room-search-cap";
import type { ExtremeListenerName } from "../listeners/extreme-listeners";
import { extremeListeners } from "../listeners/extreme-listeners";
import { plausibleListenerParameters } from "../listeners/listener-parameter-arbitraries";
import type { SimulatedListener } from "../listeners/listener-types";
import type { PsychometricListenerParameters } from "../listeners/psychometric-listener";
import { createPsychometricListener } from "../listeners/psychometric-listener";
import { keepableSettingArbitrary } from "./output-arbitraries";
import {
  advance,
  advanceTo,
  calibrate,
  createShellUnderTest,
} from "./output-shell-harness";
import {
  seedArbitrary,
  supportedSampleRateArbitrary,
} from "./sound-arbitraries";

// The shell renders through the synth; these properties give it the worst-case renderers, whose
// peaks sit exactly at the Peak_Bound, the hardest case for "no clamp" (D43).
vi.mock("../../src/audio/synth/sound-renderers", async () => {
  const { worstCaseRenderers } = await import("./worst-case-renderers");
  return { soundRenderers: worstCaseRenderers };
});

/**
 * Runs. The design gives 100; task 15 halved that to 50 because CP3, CP6 and CP8 together took
 * more than 30 seconds (D28, D50).
 */
const runs = 50;

/** Far above any room the engine can produce; a guard against a search that never ends. */
const trialGuardCount = 1000;

type ListenerSpec =
  | {
      readonly kind: "psychometric";
      readonly parameters: PsychometricListenerParameters;
    }
  | { readonly kind: "extreme"; readonly name: ExtremeListenerName };

const listenerSpecArbitrary: fc.Arbitrary<ListenerSpec> = fc.oneof(
  {
    weight: 3,
    arbitrary: plausibleListenerParameters(hearingMethodConfig).map(
      (parameters) => ({ kind: "psychometric" as const, parameters }),
    ),
  },
  {
    weight: 1,
    arbitrary: fc
      .constantFrom(...(Object.keys(extremeListeners) as ExtremeListenerName[]))
      .map((name) => ({ kind: "extreme" as const, name })),
  },
);

function createListener(spec: ListenerSpec, seed: number): SimulatedListener {
  const random = createSeededRandom(seed);
  return spec.kind === "psychometric"
    ? createPsychometricListener(spec.parameters, random)
    : extremeListeners[spec.name](random);
}

const ghostSoundIdArbitrary: fc.Arbitrary<GhostSoundId> = fc.constantFrom(
  ...ghostSoundIds,
);

describe("audio output CP8. The threshold search plays a room without a clamp (Universal; R11.6, R9.6)", () => {
  it("schedules every trial of a room at exactly the level the engine asked for, with no clamp", async () => {
    await fc.assert(
      fc.asyncProperty(
        keepableSettingArbitrary(calibrationSettingTopDb()),
        ghostSoundIdArbitrary,
        supportedSampleRateArbitrary,
        fc.tuple(seedArbitrary, seedArbitrary, seedArbitrary),
        listenerSpecArbitrary,
        async (
          settingDb,
          soundId,
          sampleRateHz,
          [shellSeed, engineSeed, listenerSeed],
          listenerSpec,
        ) => {
          const shell = createShellUnderTest({ seed: shellSeed, sampleRateHz });
          await calibrate(shell, settingDb);
          const report = shell.output.rangeReport();
          expect(report).not.toBeNull();
          if (report === null) {
            return;
          }
          const settings = {
            ...hearingMethodConfig,
            capRelativeToAnchorDb: roomSearchCapDb(
              report.rooms[soundId].topLevelDb,
              hearingMethodConfig,
            ),
          };
          const search = createThresholdSearch({
            settings,
            random: createSeededRandom(engineSeed),
          });
          const listener = createListener(listenerSpec, listenerSeed);

          shell.output.beginRoom();
          let step = search.current();
          for (
            let trialCount = 0;
            step.kind === "trial" && trialCount < trialGuardCount;
            trialCount += 1
          ) {
            const { trial } = step;
            advance(shell, trial.gapBeforeMs);
            let response: VisitorResponse;
            if (trial.kind === "sound") {
              const outcome = shell.output.play({
                soundId,
                ear: trial.ear,
                levelDb: trial.levelDb,
                purpose: "trial",
                random: shell.random,
              });
              expect(outcome).toMatchObject({
                kind: "scheduled",
                requestedLevelDb: trial.levelDb,
                playedLevelDb: trial.levelDb,
                clampLimit: null,
              });
              if (outcome.kind !== "scheduled") {
                return;
              }
              advanceTo(shell, outcome.endMs);
              response = listener.respond({
                kind: "sound",
                ear: trial.ear,
                levelDb: trial.levelDb,
              });
            } else {
              response = listener.respond({ kind: "noSound" });
            }
            step = search.respond(response);
          }
          expect(step.kind).toBe("finished");
          expect(shell.output.clampLog()).toEqual([]);
        },
      ),
      { numRuns: runs },
    );
  }, 120_000);
});
