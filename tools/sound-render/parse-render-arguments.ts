/** What the render tool was asked to do (ghost-sounds design.md, The render tool). */
export type RenderArguments =
  | { readonly mode: "full" }
  | { readonly mode: "changed"; readonly paths: readonly string[] }
  | { readonly mode: "hook" }
  | { readonly mode: "invalid"; readonly problem: string };

/** The one line printed with any argument the tool does not accept. */
export const renderUsage =
  "usage: npm run render:sounds [-- --changed <path> [--changed <path> ...] | -- --hook]";

function invalid(problem: string): RenderArguments {
  return Object.freeze({ mode: "invalid", problem });
}

/**
 * Reads the arguments after the script name: none (full mode), one or more `--changed <path>`
 * (changed-file mode), or `--hook` alone (hook mode). Anything else, including `--changed` with no
 * path after it and `--hook` together with another argument, is invalid.
 */
export function parseRenderArguments(args: readonly string[]): RenderArguments {
  if (args.length === 0) {
    return Object.freeze({ mode: "full" });
  }
  if (args.includes("--hook")) {
    return args.length === 1
      ? Object.freeze({ mode: "hook" })
      : invalid("--hook takes no other argument");
  }
  const paths: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument !== "--changed") {
      return invalid(`unknown argument "${argument}"`);
    }
    const path = args[index + 1];
    if (path === undefined || path === "" || path.startsWith("--")) {
      return invalid("--changed needs a path after it");
    }
    paths.push(path);
    index += 1;
  }
  return Object.freeze({ mode: "changed", paths: Object.freeze(paths) });
}
