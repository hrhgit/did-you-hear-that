import type { RandomSource } from "../../src/config/seeded-random";
import type {
  ListenerEar,
  ListenerResponse,
  ListenerTrial,
  SimulatedListener,
} from "./listener-types";

/** The parameters of a Psychometric_Listener (R13.1, D17). */
export interface PsychometricListenerParameters {
  /** The level of each ear at which detection, before lapses, has a chance of one half. */
  readonly trueThresholdDb: Readonly<Record<ListenerEar, number>>;
  /** Distance from the 10 percent point to the 90 percent point. 0 makes a step function. */
  readonly widthDb: number;
  /** Chance of missing a sound that would otherwise be detected. */
  readonly lapseFraction: number;
  /** Chance of answering on a trial where nothing was detected. */
  readonly falseAlarmFraction: number;
  /** Chance of naming the other ear for a detected sound. */
  readonly wrongSideFraction: number;
}

/** The logistic slope that puts the 10 and 90 percent points one width apart: 2 ln 9 / width. */
const tenToNinetyLogOdds = 2 * Math.log(9);

/** The chance of naming the left ear when answering without having heard where. */
const leftSideFraction = 0.5;

const otherEar: Readonly<Record<ListenerEar, ListenerEar>> = Object.freeze({
  left: "right",
  right: "left",
});

const rateFields = [
  "lapseFraction",
  "falseAlarmFraction",
  "wrongSideFraction",
] as const;

function validateParameters(parameters: PsychometricListenerParameters): void {
  for (const ear of ["left", "right"] as const) {
    if (!Number.isFinite(parameters.trueThresholdDb[ear])) {
      throw new RangeError(
        `trueThresholdDb.${ear} must be a finite number, but got ${String(parameters.trueThresholdDb[ear])}.`,
      );
    }
  }
  if (!(parameters.widthDb >= 0 && Number.isFinite(parameters.widthDb))) {
    throw new RangeError(
      `widthDb must be a finite number from 0 upwards, but got ${String(parameters.widthDb)}.`,
    );
  }
  for (const field of rateFields) {
    if (!(parameters[field] >= 0 && parameters[field] <= 1)) {
      throw new RangeError(
        `${field} must lie from 0 to 1, but got ${String(parameters[field])}.`,
      );
    }
  }
}

/**
 * Creates a listener that behaves like an imperfect person (R13.1 to R13.4, D17).
 *
 * A sound is detected with chance (1 − lapse) × F(level), where
 * F(L) = 1 / (1 + exp(−(L − T) × 2 ln 9 / width)), or a step at T when the width is 0. A detected
 * sound is named on its own side, or on the other side with the wrong-side chance. On a trial with
 * nothing detected, silent or not, the listener answers with the false alarm chance and names
 * either side with equal chance.
 *
 * The draws per trial come from `random` in a fixed order: on a sound trial the detection draw,
 * then the wrong-side draw for a detection or the false alarm draw for a non-detection; on a
 * no-sound trial the false alarm draw. A side draw follows a false alarm (D35).
 */
export function createPsychometricListener(
  parameters: PsychometricListenerParameters,
  random: RandomSource,
): SimulatedListener {
  validateParameters(parameters);
  const {
    trueThresholdDb,
    widthDb,
    lapseFraction,
    falseAlarmFraction,
    wrongSideFraction,
  } = parameters;

  const detectionFraction = (ear: ListenerEar, levelDb: number): number => {
    const thresholdDb = trueThresholdDb[ear];
    const curveFraction =
      widthDb === 0
        ? levelDb >= thresholdDb
          ? 1
          : 0
        : 1 /
          (1 +
            Math.exp(
              -((levelDb - thresholdDb) * tenToNinetyLogOdds) / widthDb,
            ));
    return (1 - lapseFraction) * curveFraction;
  };

  const answerWithoutHearing = (): ListenerResponse => {
    if (random.next() < falseAlarmFraction) {
      return random.next() < leftSideFraction ? "left" : "right";
    }
    return "none";
  };

  return Object.freeze({
    respond: (trial: ListenerTrial): ListenerResponse => {
      if (trial.kind === "noSound") {
        return answerWithoutHearing();
      }
      if (random.next() < detectionFraction(trial.ear, trial.levelDb)) {
        return random.next() < wrongSideFraction
          ? otherEar[trial.ear]
          : trial.ear;
      }
      return answerWithoutHearing();
    },
  });
}
