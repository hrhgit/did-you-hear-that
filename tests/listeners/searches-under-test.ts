import type { SearchUnderTest } from "./search-under-test";
import { specSearchUnderTest } from "./spec-search-under-test";

/**
 * The searches the experiment scripts can run, by the name given to `--search` (D21). On the
 * branch `experiment/no-spec-measured` this lists only the no-spec adapter (D23).
 */
export const searchesUnderTest: Readonly<Record<string, SearchUnderTest>> =
  Object.freeze({ spec: specSearchUnderTest });
