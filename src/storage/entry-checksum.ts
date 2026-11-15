import type { StoreEntryFields } from "./visit-store-types";

// The constants of the 32-bit FNV-1a definition. They are part of the hash, not tunable numbers.
const fnvOffsetBasis = 2166136261;
const fnvPrime = 16777619;
const hexDigitCount = 8;

/**
 * The checksum of a stored entry (result-page design.md, "The checksum", D6): the 32-bit FNV-1a
 * hash over the UTF-16 code units of the JSON text of the six fields in a fixed order, written as
 * eight lowercase hexadecimal digits. It makes accidental damage visible. It is not a security
 * measure: anyone who edits local storage by hand can compute it again.
 */
export function entryChecksum(fields: StoreEntryFields): string {
  const text = JSON.stringify([
    fields.savedVisitId,
    fields.savedAtEpochMs,
    fields.savedOnLocalDate,
    fields.visitType,
    fields.headphoneName,
    fields.payloadJson,
  ]);
  let hash = fnvOffsetBasis;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, fnvPrime);
  }
  return (hash >>> 0).toString(16).padStart(hexDigitCount, "0");
}
