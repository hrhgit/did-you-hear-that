import path from "node:path";
import { bannedTerms } from "../src/config/banned-terms";
import { runCopyCheck } from "./run-copy-check";

// Checks every string exported from src/copy against the banned terms in src/config
// (wording.md). Run with `npm run check:copy`.
const repositoryRoot = path.resolve(import.meta.dirname, "..");

const result = await runCopyCheck({
  copyDir: path.join(repositoryRoot, "src", "copy"),
  terms: bannedTerms,
  rootDir: repositoryRoot,
});
for (const line of result.lines) {
  console.log(line);
}
process.exitCode = result.exitCode;
