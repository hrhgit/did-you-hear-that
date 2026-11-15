import { describe, expectTypeOf, it } from "vitest";
import type { replayCopy } from "../copy/replay-copy";
import type {
  ReplayEndingName,
  ReplayPauseName,
  ReplaySideName,
} from "../copy/replay-lines";
import type { Ear, ReplayEnding, ReplayPauseReason } from "./visit-flow-types";

// The copy may import only src/config and other copy files, so it declares its own names for
// sides, endings and pause reasons (missed-sound-replay design.md, D23). The session hands its own
// values to the copy, so the two must stay the same types. These checks run when
// `npm run typecheck` compiles this file; at run time they do nothing.
describe("the replay's copy names against the session's", () => {
  it("gives the copy the same names for sides as the session", () => {
    expectTypeOf<ReplaySideName>().toEqualTypeOf<Ear>();
  });

  it("gives the copy the same names for endings as the session", () => {
    expectTypeOf<ReplayEndingName>().toEqualTypeOf<ReplayEnding>();
  });

  it("gives the copy the same names for pause reasons as the session", () => {
    expectTypeOf<ReplayPauseName>().toEqualTypeOf<ReplayPauseReason>();
  });

  it("gives a pause line for exactly the replay's pause reasons", () => {
    expectTypeOf<
      keyof (typeof replayCopy)["pauseLines"]
    >().toEqualTypeOf<ReplayPauseName>();
  });
});
