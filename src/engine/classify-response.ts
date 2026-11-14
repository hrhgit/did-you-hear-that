import type {
  NoSoundOutcome,
  SoundOutcome,
  Trial,
  VisitorResponse,
} from "./search-types";

const visitorResponses: readonly unknown[] = ["left", "right", "none"];

function describeValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  try {
    return String(value);
  } catch {
    return typeof value;
  }
}

/**
 * Classifies a response to a trial (R4.2 to R4.6). On a sound trial the trial's ear is
 * `caught`, the other ear is `wrongSide` and `"none"` is `missed`. On a no-sound trial either ear
 * is `falseAlarm` and `"none"` is `noResponse`. Any other value throws a `TypeError` (R4.7).
 */
export function classifyResponse(
  trial: Trial,
  response: VisitorResponse,
): SoundOutcome | NoSoundOutcome {
  if (!visitorResponses.includes(response)) {
    throw new TypeError(
      `A response must be "left", "right" or "none", but got ${describeValue(response)}.`,
    );
  }
  if (trial.kind === "noSound") {
    return response === "none" ? "noResponse" : "falseAlarm";
  }
  if (response === "none") {
    return "missed";
  }
  return response === trial.ear ? "caught" : "wrongSide";
}
