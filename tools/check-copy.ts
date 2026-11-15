import path from "node:path";
import {
  bannedTerms,
  limitsStatementAllowedTerms,
} from "../src/config/banned-terms";
import { copyCheckStreams } from "./copy-check-streams";
import { runCopyCheck } from "./run-copy-check";

// Checks every string exported from src/copy against the banned terms in src/config
// (wording.md). The one exemption is the fixed limits statement, which may use the allowed terms
// of banned-terms.ts and no other banned term (wording.md, "One exception"; result-page
// design.md, D23). Run with `npm run check:copy`, or, from the Kiro hook,
// `npm run --silent check:copy -- --hook`: then findings go to standard error with exit code 1,
// and a clean run prints one line (result-page design.md, "The copy hook").
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const hookMode = process.argv.slice(2).includes("--hook");

const result = await runCopyCheck({
  copyDir: path.join(repositoryRoot, "src", "copy"),
  terms: bannedTerms,
  rootDir: repositoryRoot,
  exemptions: [
    {
      file: "src/copy/limits-statement.ts",
      exportName: "limitsStatement",
      allowedTerms: limitsStatementAllowedTerms,
    },
  ],
});
const streams = copyCheckStreams(result, hookMode);
for (const line of streams.stdoutLines) {
  console.log(line);
}
for (const line of streams.stderrLines) {
  console.error(line);
}
process.exitCode = result.exitCode;
