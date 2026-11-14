import { describe, expectTypeOf, it } from "vitest";
import type { Ear as OutputEar } from "../audio/output/output-types";
import type { Ear as EngineEar } from "../engine/search-types";

// The output stage may not import the engine, so it declares `Ear` again (design.md, Types). The
// session passes the engine's ears to the output stage, so the two must stay the same type. The
// check runs when `npm run typecheck` compiles this file; at run time it does nothing.
describe("Ear", () => {
  it("is the same type in the output stage and in the engine", () => {
    expectTypeOf<OutputEar>().toEqualTypeOf<EngineEar>();
  });
});
