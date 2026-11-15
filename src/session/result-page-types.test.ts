import { describe, expectTypeOf, it } from "vitest";
import type {
  DeleteOutcome,
  DeleteRefusal,
  ResultPictureInput,
  SaveOutcome,
  SaveRefusal,
  SavedVisit,
  StorageArea,
  VisitEarResult,
  VisitToSave,
  WingState,
} from "./result-page-types";
import type { ResultSnapshot } from "./visit-flow-types";

// Type-level checks of the result page's interface contract against the visit flow's contract and
// the DOM (result-page design.md, "Interface contract"). They run when `npm run typecheck`
// compiles this file; at run time they do nothing.

describe("result-page-types", () => {
  it("takes the visit flow's ResultSnapshot as a VisitToSave", () => {
    expectTypeOf<ResultSnapshot>().toExtend<VisitToSave>();
  });

  it("takes the DOM's Storage as a StorageArea, so window.localStorage fits", () => {
    expectTypeOf<Storage>().toExtend<StorageArea>();
  });

  it("gives a wing the states of a visit ear result", () => {
    expectTypeOf<WingState>().toEqualTypeOf<VisitEarResult["state"]>();
  });

  it("tells the two picture inputs apart by kind", () => {
    expectTypeOf<ResultPictureInput["kind"]>().toEqualTypeOf<
      "live" | "saved"
    >();
    type Live = Extract<ResultPictureInput, { readonly kind: "live" }>;
    type Saved = Extract<ResultPictureInput, { readonly kind: "saved" }>;
    expectTypeOf<Live>().not.toBeNever();
    expectTypeOf<Saved>().not.toBeNever();
    expectTypeOf<Exclude<ResultPictureInput, Live>>().toEqualTypeOf<Saved>();
    expectTypeOf<Live["visit"]>().toEqualTypeOf<VisitToSave>();
    expectTypeOf<Saved["savedVisit"]>().toEqualTypeOf<SavedVisit>();
  });

  it("tells a save outcome apart by saved", () => {
    expectTypeOf<SaveOutcome["saved"]>().toEqualTypeOf<boolean>();
    type Saved = Extract<SaveOutcome, { readonly saved: true }>;
    type NotSaved = Extract<SaveOutcome, { readonly saved: false }>;
    expectTypeOf<Saved>().not.toBeNever();
    expectTypeOf<NotSaved>().not.toBeNever();
    expectTypeOf<Exclude<SaveOutcome, Saved>>().toEqualTypeOf<NotSaved>();
    expectTypeOf<Saved["savedVisit"]>().toEqualTypeOf<SavedVisit>();
    expectTypeOf<NotSaved["reason"]>().toEqualTypeOf<SaveRefusal>();
  });

  it("tells a delete outcome apart by deleted", () => {
    expectTypeOf<DeleteOutcome["deleted"]>().toEqualTypeOf<boolean>();
    type Deleted = Extract<DeleteOutcome, { readonly deleted: true }>;
    type NotDeleted = Extract<DeleteOutcome, { readonly deleted: false }>;
    expectTypeOf<Deleted>().not.toBeNever();
    expectTypeOf<NotDeleted>().not.toBeNever();
    expectTypeOf<Exclude<DeleteOutcome, Deleted>>().toEqualTypeOf<NotDeleted>();
    expectTypeOf<Deleted["deletedCount"]>().toEqualTypeOf<number>();
    expectTypeOf<NotDeleted["reason"]>().toEqualTypeOf<DeleteRefusal>();
  });
});
