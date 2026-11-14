import path from "node:path";
import { runSoundRender } from "./run-sound-render";

// Renders every ghost sound offline and writes a spectrum report, once the ghost-sounds spec
// adds rendering. Run with `npm run render:sounds`.
const repositoryRoot = path.resolve(import.meta.dirname, "..");

const result = runSoundRender({
  synthDir: path.join(repositoryRoot, "src", "audio", "synth"),
  rootDir: repositoryRoot,
});
for (const line of result.lines) {
  console.log(line);
}
process.exitCode = result.exitCode;
