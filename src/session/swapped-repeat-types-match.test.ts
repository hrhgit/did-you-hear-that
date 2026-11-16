import { describe, expectTypeOf, it } from "vitest";
import type { swappedRepeatCopy } from "../copy/swapped-repeat-copy";
import type {
  SwapSideName,
  SwappedRepeatOutcomeName,
  SwappedRepeatUnclearReasonName,
} from "../copy/swapped-repeat-lines";
import type {
  Ear,
  EarpieceArrangement,
  SwappedRepeatCheck,
  SwappedRepeatEnding,
  SwappedRepeatOutcome,
  SwappedRepeatPauseReason,
  SwappedRepeatUnavailableReason,
  SwappedRepeatUnclearReason,
} from "./visit-flow-types";

// The copy may import only src/config and other copy files, so it declares its own names for
// sides, outcomes and unclear reasons, and keys its records by the session's values
// (swapped-repeat design.md, D18, "`src/copy/swapped-repeat-lines.ts`"). The session hands its own
// values to the copy, so the two must stay the same types. These checks run when
// `npm run typecheck` compiles this file; at run time they do nothing.
type Copy = typeof swappedRepeatCopy;

describe("the swapped repeat's copy names against the session's", () => {
  it("gives the copy the same names for sides as the session", () => {
    expectTypeOf<SwapSideName>().toEqualTypeOf<Ear>();
  });

  it("gives the copy the same names for outcomes as the session", () => {
    expectTypeOf<SwappedRepeatOutcomeName>().toEqualTypeOf<SwappedRepeatOutcome>();
  });

  it("gives the copy the same names for unclear reasons as the session", () => {
    expectTypeOf<SwappedRepeatUnclearReasonName>().toEqualTypeOf<SwappedRepeatUnclearReason>();
  });

  it("gives a judgement line for confirmed and for each judgement that keeps the visitor in the check", () => {
    expectTypeOf<keyof Copy["judgementLines"]>().toEqualTypeOf<
      "confirmed" | NonNullable<SwappedRepeatCheck["judgement"]>
    >();
  });

  it("gives a pause line for exactly the repeat's pause reasons", () => {
    expectTypeOf<
      keyof Copy["pauseLines"]
    >().toEqualTypeOf<SwappedRepeatPauseReason>();
  });

  it("gives an unavailable line for exactly the unavailable reasons", () => {
    expectTypeOf<
      keyof Copy["unavailableLines"]
    >().toEqualTypeOf<SwappedRepeatUnavailableReason>();
  });

  it("gives an end line for exactly the endings", () => {
    expectTypeOf<keyof Copy["endLines"]>().toEqualTypeOf<SwappedRepeatEnding>();
  });

  it("gives a run label for exactly the arrangements", () => {
    expectTypeOf<
      keyof Copy["runLabels"]
    >().toEqualTypeOf<EarpieceArrangement>();
  });

  it("gives an earpiece label for exactly the earpieces", () => {
    expectTypeOf<keyof Copy["earpieceLabels"]>().toEqualTypeOf<Ear>();
  });

  it("gives an earpiece mark for exactly the earpieces", () => {
    expectTypeOf<keyof Copy["earpieceMarks"]>().toEqualTypeOf<Ear>();
  });

  it("gives an outcome label for exactly the outcomes", () => {
    expectTypeOf<
      keyof Copy["outcomeLabels"]
    >().toEqualTypeOf<SwappedRepeatOutcome>();
  });
});
