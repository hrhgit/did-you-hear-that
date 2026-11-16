import type { VisitType } from "../config/hearing-method-config";

// The types of the visit store (result-page design.md, "The Visit_Store"). The store knows the
// envelope of a saved visit and keeps its payload as text whose content it does not read (D4).

/** The fields of one stored entry, without its checksum. */
export interface StoreEntryFields {
  /** Eight lowercase hexadecimal digits. */
  readonly savedVisitId: string;
  /** When it was saved, in milliseconds since 1970-01-01T00:00:00Z. */
  readonly savedAtEpochMs: number;
  /** The visitor's calendar date when it was saved, "YYYY-MM-DD". */
  readonly savedOnLocalDate: string;
  readonly visitType: VisitType;
  /** The tidy form of the headphone name, or null for none. */
  readonly headphoneName: string | null;
  /** The payload as JSON text. The store never reads it. */
  readonly payloadJson: string;
}

/**
 * What `read` gives. `ready`: the readable entries in save order, oldest first, and how many
 * entries could not be read. `unavailable`: no local storage, or it cannot be read.
 * `unreadable`: the value under the key cannot be read as a whole.
 */
export type StoreRead =
  | {
      readonly status: "ready";
      readonly entries: readonly StoreEntryFields[];
      readonly unreadableCount: number;
    }
  | { readonly status: "unavailable" }
  | { readonly status: "unreadable" };

/** Why a write did not happen. */
export type StoreRefusal =
  "unavailable" | "unreadable" | "refused" | "full" | "notFound" | "idTaken";

/** What a write gives. */
export type StoreWrite =
  { readonly ok: true } | { readonly ok: false; readonly reason: StoreRefusal };

/** The saved visits under the one key. No method throws, whatever local storage does or holds. */
export interface VisitStore {
  /** The readable entries in save order and the number of unreadable ones. */
  read(): StoreRead;
  /** Adds an entry at the end. `idTaken` when its id is in the value. */
  append(fields: StoreEntryFields): StoreWrite;
  /** Gives one entry a new headphone name and a new checksum. */
  changeName(savedVisitId: string, headphoneName: string | null): StoreWrite;
  /** Gives one entry a new payload and a new checksum. */
  changePayload(savedVisitId: string, payloadJson: string): StoreWrite;
  /** Removes one entry; removes the key when nothing else is left. */
  remove(savedVisitId: string): StoreWrite;
  /** Removes the key, readable or not. */
  removeAll(): StoreWrite;
}
