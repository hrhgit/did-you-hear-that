import type { RandomSource } from "../../src/config/seeded-random";
import type {
  ListenerEar,
  ListenerResponse,
  ListenerTrial,
  SimulatedListener,
} from "./listener-types";

export type ExtremeListenerName =
  | "alwaysAnswers"
  | "neverAnswers"
  | "answersAtRandom"
  | "alwaysAnswersWrongSide"
  | "alwaysPressesLeft";

/** The chance of naming the left ear when a side is picked at random. */
const leftSideFraction = 0.5;

const allResponses = ["left", "right", "none"] as const;

const otherEar: Readonly<Record<ListenerEar, ListenerEar>> = Object.freeze({
  left: "right",
  right: "left",
});

const randomSide = (random: RandomSource): ListenerEar =>
  random.next() < leftSideFraction ? "left" : "right";

const listener = (
  respond: (trial: ListenerTrial) => ListenerResponse,
): SimulatedListener => Object.freeze({ respond });

/**
 * The listeners that behave badly on purpose (R13.5, D17). Each is a factory that takes its own
 * random source, so a run can be replayed (R13.6). Every listener takes the source, also those
 * that draw nothing, so all five can be created the same way.
 *
 * - `alwaysAnswers`: a random side on every trial.
 * - `neverAnswers`: `"none"` on every trial.
 * - `answersAtRandom`: `"left"`, `"right"` or `"none"` with equal chance on every trial.
 * - `alwaysAnswersWrongSide`: the other ear on every sound trial and a random side on every
 *   no-sound trial.
 * - `alwaysPressesLeft`: `"left"` on every trial.
 */
export const extremeListeners: Readonly<
  Record<ExtremeListenerName, (random: RandomSource) => SimulatedListener>
> = Object.freeze({
  alwaysAnswers: (random: RandomSource) => listener(() => randomSide(random)),
  neverAnswers: () => listener(() => "none"),
  answersAtRandom: (random: RandomSource) =>
    listener(
      () => allResponses[Math.floor(random.next() * allResponses.length)],
    ),
  alwaysAnswersWrongSide: (random: RandomSource) =>
    listener((trial) =>
      trial.kind === "sound" ? otherEar[trial.ear] : randomSide(random),
    ),
  alwaysPressesLeft: () => listener(() => "left"),
});
