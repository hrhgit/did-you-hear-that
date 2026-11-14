import { createSeededRandom } from "../../config/seeded-random";
import { createSystemTimer } from "../../config/system-timer";
import { renderListeningPage } from "./render-listening-page";

// The entry that listen.html loads (design.md, "The listening page", D26). It is the one place
// that chooses a seed. The seed is drawn with crypto.getRandomValues and shown on the page, so
// that any sound heard can be rendered again (R19.7, R19.9).
const seedWords = new Uint32Array(1);
crypto.getRandomValues(seedWords);
const seed = seedWords[0] ?? 0;

renderListeningPage(document, window, {
  random: createSeededRandom(seed),
  seed,
  timer: createSystemTimer(),
});
