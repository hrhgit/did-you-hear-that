/**
 * Throws an `Error` with `message` when `condition` is false. The checks use this instead of
 * Vitest's `expect`, because the property CLI runs them outside Vitest. fast-check reports the
 * message with the shrunk counterexample.
 */
export function checkThat(
  condition: boolean,
  message: () => string,
): asserts condition {
  if (!condition) {
    throw new Error(message());
  }
}
