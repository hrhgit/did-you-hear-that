/**
 * The part of the browser's `Storage` the visit store uses (result-page design.md, "The
 * Visit_Store"). `window.localStorage` fits it. It has the same three methods as `StorageArea` of
 * `src/session/result-page-types.ts`, and a type test checks that the two are equal.
 */
export interface StorageArea {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
