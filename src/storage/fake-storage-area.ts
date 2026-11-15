import type { StorageArea } from "./storage-area";

/** How a fake storage area behaves. Every option is off unless given. */
export interface FakeStorageAreaOptions {
  /** The keys and values it holds at the start. */
  readonly initialItems?: Readonly<Record<string, string>>;
  /**
   * The most characters it holds over all keys and values. A `setItem` that would hold more
   * throws a `DOMException` named `QuotaExceededError` and changes nothing.
   */
  readonly maxCharacterCount?: number;
  /** `getItem` throws a `DOMException` named `SecurityError`. */
  readonly getItemThrows?: boolean;
  /** `setItem` throws a `DOMException` named `SecurityError` and changes nothing. */
  readonly setItemThrows?: boolean;
  /** `removeItem` throws a `DOMException` named `SecurityError` and changes nothing. */
  readonly removeItemThrows?: boolean;
}

/** One call made to a fake storage area. `value` only for `setItem`. */
export type FakeStorageCall =
  | { readonly method: "getItem"; readonly key: string }
  | { readonly method: "setItem"; readonly key: string; readonly value: string }
  | { readonly method: "removeItem"; readonly key: string };

/** An in-memory storage area for tests, which records every call. */
export interface FakeStorageArea extends StorageArea {
  /** Every call so far, in order, including those that threw. */
  readonly calls: readonly FakeStorageCall[];
  /** A copy of what it holds now. */
  items(): Readonly<Record<string, string>>;
}

/** The characters held over all keys and values. */
function characterCount(items: ReadonlyMap<string, string>): number {
  let count = 0;
  for (const [key, value] of items) {
    count += key.length + value.length;
  }
  return count;
}

/**
 * An in-memory `StorageArea` for tests in `src/storage`, `src/session` and `tests/` (result-page
 * design.md, "The Visit_Store"). It can refuse to read, refuse to write, refuse to remove, and
 * hold a limited number of characters, as a browser's local storage can. A getter that throws or
 * gives null is a function the test writes.
 */
export function createFakeStorageArea(
  options: FakeStorageAreaOptions = {},
): FakeStorageArea {
  const items = new Map<string, string>(
    Object.entries(options.initialItems ?? {}),
  );
  const calls: FakeStorageCall[] = [];

  return {
    calls,
    items(): Readonly<Record<string, string>> {
      return Object.freeze(Object.fromEntries(items));
    },
    getItem(key: string): string | null {
      calls.push({ method: "getItem", key });
      if (options.getItemThrows === true) {
        throw new DOMException("Reading is refused.", "SecurityError");
      }
      return items.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      calls.push({ method: "setItem", key, value });
      if (options.setItemThrows === true) {
        throw new DOMException("Writing is refused.", "SecurityError");
      }
      if (options.maxCharacterCount !== undefined) {
        const next = new Map(items);
        next.set(key, value);
        if (characterCount(next) > options.maxCharacterCount) {
          throw new DOMException("The quota is full.", "QuotaExceededError");
        }
      }
      items.set(key, value);
    },
    removeItem(key: string): void {
      calls.push({ method: "removeItem", key });
      if (options.removeItemThrows === true) {
        throw new DOMException("Removing is refused.", "SecurityError");
      }
      items.delete(key);
    },
  };
}
