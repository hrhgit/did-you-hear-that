import fc from "fast-check";
import { createSeededRandom } from "../../../src/config/seeded-random";
import {
  extremeListeners,
  type ExtremeListenerName,
} from "../../listeners/extreme-listeners";
import {
  plausibleListenerParameters,
  type ListenerLevelRange,
} from "../../listeners/listener-parameter-arbitraries";
import type {
  ListenerResponse,
  ListenerTrial,
  SimulatedListener,
} from "../../listeners/listener-types";
import { createPsychometricListener } from "../../listeners/psychometric-listener";

/**
 * Something that answers a room: a description for counterexamples, and a factory that makes a
 * fresh listener for each run, so two runs of one responder start from the same state.
 */
export interface Responder {
  readonly description: string;
  createListener(): SimulatedListener;
}

const responseArbitrary: fc.Arbitrary<ListenerResponse> = fc.constantFrom(
  "left",
  "right",
  "none",
);

const listenerSeedArbitrary = fc.integer({ min: 0, max: 2 ** 32 - 1 });

const responder = (
  description: string,
  createListener: () => SimulatedListener,
): Responder =>
  Object.freeze({
    description,
    createListener,
    [fc.toStringMethod]: () => description,
  });

/** Answers the n-th trial with the n-th scripted response, and every later trial with the fallback. */
const scriptedResponder = fc
  .record({
    responses: fc.array(responseArbitrary, { maxLength: 60 }),
    fallback: responseArbitrary,
  })
  .map(({ responses, fallback }) =>
    responder(
      `scripted ${JSON.stringify(responses)} then "${fallback}"`,
      () => {
        let index = 0;
        return {
          respond: (): ListenerResponse => {
            const response = responses[index] ?? fallback;
            index += 1;
            return response;
          },
        };
      },
    ),
  );

/**
 * Answers with a generated function of the trial's kind, ear and level and of the trial's
 * position in the room, which the listener counts itself (design.md, CP4).
 */
const functionResponder = fc
  .func<[string, string, number, number], ListenerResponse>(responseArbitrary)
  .map((answer) =>
    responder(`function ${fc.stringify(answer)}`, () => {
      let index = 0;
      return {
        respond: (trial: ListenerTrial): ListenerResponse => {
          index += 1;
          return trial.kind === "sound"
            ? answer(trial.kind, trial.ear, trial.levelDb, index)
            : answer(trial.kind, "", 0, index);
        },
      };
    }),
  );

const extremeResponder = fc
  .record({
    name: fc.constantFrom(
      ...(Object.keys(extremeListeners) as ExtremeListenerName[]),
    ),
    seed: listenerSeedArbitrary,
  })
  .map(({ name, seed }) =>
    responder(`extreme ${name}, listener seed ${String(seed)}`, () =>
      extremeListeners[name](createSeededRandom(seed)),
    ),
  );

const psychometricResponder = (levels: ListenerLevelRange) =>
  fc
    .record({
      parameters: plausibleListenerParameters(levels),
      seed: listenerSeedArbitrary,
    })
    .map(({ parameters, seed }) =>
      responder(
        `psychometric ${JSON.stringify(parameters)}, listener seed ${String(seed)}`,
        () => createPsychometricListener(parameters, createSeededRandom(seed)),
      ),
    );

/**
 * The responders of CP4, which CP5, CP6, CP7 and CP9 share: a scripted list of responses, a
 * generated function of the trial, every extreme listener, and Psychometric_Listeners from the
 * Plausible_Range between the given floor and cap.
 */
export const responderArbitrary = (
  levels: ListenerLevelRange,
): fc.Arbitrary<Responder> =>
  fc.oneof(
    scriptedResponder,
    functionResponder,
    extremeResponder,
    psychometricResponder(levels),
  );
