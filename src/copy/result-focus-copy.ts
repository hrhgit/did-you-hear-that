import { limitsStatement } from "./limits-statement";
import type { AnswerSide } from "./room-copy";
import { outcomeLines } from "./swapped-repeat-lines";

// The one thing the result page puts first: what stands out in this visit and what to do next
// (the focus of the result, decided by the owner on 2026-11-17). Every line is about one floor's
// own left and right, or about a swap of the headphones on one floor. No line compares, ranks or
// sums floors: when more than one floor stands out for the same reason, each is named on its own.

/**
 * Why a floor stands out, from the most pressing down. `followsEar`, `followsEarpiece` and
 * `repeatUnclear` are the outcomes of a swapped repeat of the floor. `dark`: a side did not catch
 * even the loudest sound. `farApart`: left and right at least the swap limit apart. `unsettled`: a
 * side has no level.
 */
export type FocusPointKindName =
  | "followsEar"
  | "dark"
  | "farApart"
  | "unsettled"
  | "followsEarpiece"
  | "repeatUnclear";

/** The kinds in the order the page puts them, the most pressing first. */
export const focusPointKindOrder: readonly FocusPointKindName[] = Object.freeze(
  [
    "followsEar",
    "dark",
    "farApart",
    "unsettled",
    "followsEarpiece",
    "repeatUnclear",
  ],
);

/** What a point's line needs to know about its floor. */
export type FocusPointWords =
  | { readonly kind: "followsEar" | "followsEarpiece" | "repeatUnclear" }
  | {
      readonly kind: "farApart";
      /** Right minus left. With `atLeast`, the least it can be. */
      readonly rightMinusLeftDb: number;
      /** One side was quieter than the house can whisper, so only the least gap is known. */
      readonly atLeast: boolean;
    }
  | {
      readonly kind: "dark" | "unsettled";
      readonly sides: readonly AnswerSide[];
    };

export const resultFocusCopy = Object.freeze({
  /** The small label above the heading of the card. */
  eyebrow: "What stands out",
  closeHeading: "Your left and right stayed close",
  /** Added on the visit that has just ended, which can still be saved. */
  keepLine: "Save this visit to set a later one beside it.",
});

function requireKind(kind: FocusPointKindName): void {
  if (!focusPointKindOrder.includes(kind)) {
    throw new RangeError(`Unknown focus point ${String(kind)}.`);
  }
}

function requireFloorCount(count: number): void {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(
      `A focus needs one floor or more, but got ${String(count)}.`,
    );
  }
}

function requireSides(sides: readonly AnswerSide[]): void {
  const known = sides.every((side) => side === "left" || side === "right");
  if (
    !known ||
    sides.length < 1 ||
    sides.length > 2 ||
    new Set(sides).size !== sides.length
  ) {
    throw new RangeError(
      `A point needs one side or both, but got ${JSON.stringify(sides)}.`,
    );
  }
}

/** "on your left", or "on either side" for both. */
function whereOf(sides: readonly AnswerSide[]): string {
  return sides.length === 2
    ? "on either side"
    : `on your ${sides[0] ?? "left"}`;
}

/** One floor's line beside its name, such as "The estimate is 18 dB quieter on your left than on your right." */
export function focusPointLine(point: FocusPointWords): string {
  requireKind(point.kind);
  switch (point.kind) {
    case "followsEar":
      return "After the swap, the difference stayed with your ears.";
    case "followsEarpiece":
      return "After the swap, the difference went with the headphones.";
    case "repeatUnclear":
      return "The swap did not make it clear where the difference belongs.";
    case "farApart": {
      if (!Number.isFinite(point.rightMinusLeftDb)) {
        throw new RangeError(
          `A difference must be a finite number of decibels, but got ${String(point.rightMinusLeftDb)}.`,
        );
      }
      const whole = Math.round(point.rightMinusLeftDb);
      if (whole === 0) {
        throw new RangeError("Left and right far apart cannot be 0 dB apart.");
      }
      const quieter = whole > 0 ? "left" : "right";
      const other = whole > 0 ? "right" : "left";
      const size = `${point.atLeast ? "at least " : ""}${String(Math.abs(whole))} dB`;
      return `The estimate is ${size} quieter on your ${quieter} than on your ${other}.`;
    }
    case "dark":
      requireSides(point.sides);
      return `You did not catch the loudest sound the house may play ${whereOf(point.sides)}.`;
    case "unsettled":
      requireSides(point.sides);
      return `The house found no level ${whereOf(point.sides)}.`;
  }
}

/**
 * The heading of the card when floors stand out: `kind` is the most pressing kind on the page,
 * `floorCount` how many floors stand out for it, and `sideCount` how many sides in all, for
 * `dark`.
 */
export function focusHeading(
  kind: FocusPointKindName,
  floorCount: number,
  sideCount: number,
): string {
  requireKind(kind);
  requireFloorCount(floorCount);
  switch (kind) {
    case "followsEar":
      return "A difference stayed with your ears";
    case "dark":
      return sideCount === 1
        ? "One side stayed dark"
        : "Some sides stayed dark";
    case "farApart":
      return floorCount === 1
        ? "Your left and right were far apart at one pitch"
        : `Your left and right were far apart at ${String(floorCount)} pitches`;
    case "unsettled":
      return floorCount === 1
        ? "The house found no level at one pitch"
        : `The house found no level at ${String(floorCount)} pitches`;
    case "followsEarpiece":
      return "The difference went with the headphones";
    case "repeatUnclear":
      return "The swap gave no clear answer";
  }
}

/** What to do next, under the heading. */
export function focusLine(
  kind: FocusPointKindName,
  floorCount: number,
): string {
  requireKind(kind);
  requireFloorCount(floorCount);
  const creatures = floorCount === 1 ? "that creature" : "those creatures";
  switch (kind) {
    case "followsEar":
      return limitsStatement.sentences[3];
    case "dark":
      return "Check that both earpieces play and that the volume is where you set it, then walk through the house again.";
    case "farApart":
      return `Swapping the headphones and hearing ${creatures} again tells whether the difference stays with your ears or moves with the headphones.`;
    case "unsettled":
      return `Each one below says why. Walking through the house again gives ${creatures} another try.`;
    case "followsEarpiece":
      return outcomeLines("followsEarpiece", null)[0] ?? "";
    case "repeatUnclear":
      return "With the headphones swapped, the answers did not point to your ears or to the headphones.";
  }
}

/** Under the heading when no floor stands out. `limitDb` is the difference that offers the swap. */
export function closeLine(limitDb: number, canStillSave: boolean): string {
  if (!Number.isFinite(limitDb) || limitDb <= 0) {
    throw new RangeError(
      `A swap limit must be a positive number of decibels, but got ${String(limitDb)}.`,
    );
  }
  const line = `No pitch showed a difference of ${String(Math.round(limitDb))} dB or more between your left and your right.`;
  return canStillSave ? `${line} ${resultFocusCopy.keepLine}` : line;
}

/** The label of the control that takes the visitor to a floor's words: "Scritch, 4 kHz". */
export function focusFloorLabel(roomName: string, pitch: string): string {
  return `${roomName}, ${pitch}`;
}

/**
 * The key under the picture: what each mark of the drawing means. A mark's line is shown only
 * when the picture holds that mark.
 */
export const pictureKeyCopy = Object.freeze({
  label: "What the marks mean",
  light: "Light: how far you followed the sound",
  creature: "Creature: where the light ends",
  dark: "Dash means the loudest sound went by",
  hatched: "Hatched: no level was found",
  earlier: "Dashed: your earlier visit",
});
