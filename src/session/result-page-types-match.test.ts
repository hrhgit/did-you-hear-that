import { describe, expectTypeOf, it } from "vitest";
import type { createSystemWallClock } from "../config/system-wall-clock";
import type { UnreliableReasonName, WingStateName } from "../copy/result-lines";
import type {
  DeleteRefusalName,
  SaveRefusalName,
} from "../copy/saved-visit-lines";
import type { StorageArea as StoreStorageArea } from "../storage/storage-area";
import type {
  DeleteRefusal,
  SaveRefusal,
  StorageArea,
  VisitUnreliableReason,
  WallClock,
  WingState,
} from "./result-page-types";
import type { knownUnreliableReasons } from "./saved-visit-payload";

// The contract may not wait for the code it describes, so it declares its own types, and the
// code of src/config, src/copy and src/storage is written later to fit them (result-page
// design.md, D1 and D21). These checks run when `npm run typecheck` compiles this file; at run
// time they do nothing.
describe("result-page-types against the code that fits it", () => {
  it("takes the system wall clock as a WallClock", () => {
    expectTypeOf<
      ReturnType<typeof createSystemWallClock>
    >().toExtend<WallClock>();
  });

  it("gives the storage module the same StorageArea as the contract", () => {
    expectTypeOf<StoreStorageArea>().toEqualTypeOf<StorageArea>();
  });

  it("gives the copy the same names for wing states as the session", () => {
    expectTypeOf<WingStateName>().toEqualTypeOf<WingState>();
  });

  it("gives the copy the same names for unreliable reasons as the session", () => {
    expectTypeOf<UnreliableReasonName>().toEqualTypeOf<VisitUnreliableReason>();
  });

  it("gives the copy the same names for save refusals as the contract", () => {
    expectTypeOf<SaveRefusalName>().toEqualTypeOf<SaveRefusal>();
  });

  it("gives the copy the same names for delete refusals as the contract", () => {
    expectTypeOf<DeleteRefusalName>().toEqualTypeOf<DeleteRefusal>();
  });

  it("gives the payload parser every unreliable reason of the session, and no other", () => {
    expectTypeOf<
      (typeof knownUnreliableReasons)[number]
    >().toEqualTypeOf<VisitUnreliableReason>();
  });
});
