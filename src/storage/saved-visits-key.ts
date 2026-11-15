/**
 * The one key of local storage this product uses (result-page design.md, "Key and value"). A site
 * on github.io shares its origin, and so its local storage, with every other project page of the
 * same account, so the key carries the product's name. The `v1` names the format of the value: a
 * later format this code cannot read uses a new key, which this code never touches.
 */
export const savedVisitsKey = "did-you-hear-that:saved-visits:v1";

/** The format version the value under `savedVisitsKey` holds. A name of the format, not a tunable number. */
export const savedVisitsFormatVersion = 1;
