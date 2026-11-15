// The names and legacy codes browsers give a full quota (result-page design.md, D8): Chrome and
// Safari name it QuotaExceededError with code 22, and older Firefox names it
// NS_ERROR_DOM_QUOTA_REACHED with code 1014. They are names of browser errors, not tunable numbers.
const quotaErrorNames: readonly string[] = Object.freeze([
  "QuotaExceededError",
  "NS_ERROR_DOM_QUOTA_REACHED",
]);
const quotaErrorCodes: readonly number[] = Object.freeze([22, 1014]);

/**
 * What a write error of local storage means (D8): `full` for a full quota, by its name or its
 * code, and `refused` for anything else, including values that are not errors. Never throws.
 */
export function storageErrorKind(error: unknown): "full" | "refused" {
  try {
    if (typeof error !== "object" || error === null) {
      return "refused";
    }
    const { name, code } = error as { name?: unknown; code?: unknown };
    if (typeof name === "string" && quotaErrorNames.includes(name)) {
      return "full";
    }
    if (typeof code === "number" && quotaErrorCodes.includes(code)) {
      return "full";
    }
    return "refused";
  } catch {
    // Reading a field of a strange value threw. It is still not a full quota.
    return "refused";
  }
}
