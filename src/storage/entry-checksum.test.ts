import { describe, expect, it } from "vitest";
import { entryChecksum } from "./entry-checksum";
import type { StoreEntryFields } from "./visit-store-types";

/** A plain FNV-1a over UTF-16 code units, written separately from the code under test. */
function referenceFnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const fields: StoreEntryFields = {
  savedVisitId: "3f9a0c11",
  savedAtEpochMs: 1795180800000,
  savedOnLocalDate: "2026-11-20",
  visitType: "full",
  headphoneName: "White earbuds",
  payloadJson: "{}",
};

describe("entryChecksum", () => {
  it("has a reference that gives the published FNV-1a values", () => {
    expect(referenceFnv1a("")).toBe("811c9dc5");
    expect(referenceFnv1a("a")).toBe("e40c292c");
    expect(referenceFnv1a("foobar")).toBe("bf9cf968");
  });

  it("is FNV-1a over the JSON text of the six fields in their order", () => {
    expect(entryChecksum(fields)).toBe(
      referenceFnv1a(
        JSON.stringify([
          fields.savedVisitId,
          fields.savedAtEpochMs,
          fields.savedOnLocalDate,
          fields.visitType,
          fields.headphoneName,
          fields.payloadJson,
        ]),
      ),
    );
  });

  it("pins known values for fixed fields", () => {
    // Computed once from this implementation. A change here means every stored entry would no
    // longer check.
    expect(entryChecksum(fields)).toBe("0d639eb4");
    expect(
      entryChecksum({
        savedVisitId: "00000000",
        savedAtEpochMs: 0,
        savedOnLocalDate: "2026-01-01",
        visitType: "full",
        headphoneName: null,
        payloadJson: "",
      }),
    ).toBe("557af3c3");
  });

  it.each([
    ["savedVisitId", { savedVisitId: "3f9a0c12" }],
    ["savedAtEpochMs", { savedAtEpochMs: 1795180800001 }],
    ["savedOnLocalDate", { savedOnLocalDate: "2026-11-21" }],
    ["headphoneName to another name", { headphoneName: "White earbudS" }],
    ["headphoneName to null", { headphoneName: null }],
    ["payloadJson", { payloadJson: "{ }" }],
  ] as const)("changes when %s changes", (_label, change) => {
    expect(entryChecksum({ ...fields, ...change })).not.toBe(
      entryChecksum(fields),
    );
  });

  it("tells a null name from the text null", () => {
    expect(entryChecksum({ ...fields, headphoneName: null })).not.toBe(
      entryChecksum({ ...fields, headphoneName: "null" }),
    );
  });

  it("is eight lowercase hexadecimal digits", () => {
    for (const payloadJson of ["", "x", "{}", "é", "🎧", "a".repeat(5000)]) {
      expect(entryChecksum({ ...fields, payloadJson })).toMatch(
        /^[0-9a-f]{8}$/,
      );
    }
  });
});
