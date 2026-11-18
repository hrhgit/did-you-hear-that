import { expect, test } from "@playwright/test";
import { practiceCopy } from "../../src/copy/practice-copy";
import { replayCopy } from "../../src/copy/replay-copy";
import { resultPageCopy } from "../../src/copy/result-page-copy";
import { roomCopy } from "../../src/copy/room-copy";
import { expectNoHorizontalScroll, openPage } from "./page-checks";
import { previewServers } from "./preview-servers";
import { button, enterRoom, heading } from "./visit-steps";

// One whole short visit on the public page, in which nobody answers: the one room until every
// creature has gone home, the replay of the missed sounds from its first sound to its last, and
// the picture. It takes several minutes
// of real time, because the page waits for answers that never come, so it runs only when asked:
//
//   WHOLE_VISIT=1 npx playwright test whole-visit --project=desktop
//
// The browser is muted. This checks that the page gets through the replay and what it shows on
// the way, not what anything sounds like.
test.use({ launchOptions: { args: ["--mute-audio"] } });
test.skip(
  process.env.WHOLE_VISIT !== "1",
  "A whole visit takes minutes. Set WHOLE_VISIT=1 to walk it.",
);

const server = previewServers[0];
if (server === undefined) {
  throw new Error("There is no preview server to test against.");
}
const address = `http://localhost:${String(server.port)}${server.basePath}`;

/** What the page showed of the replay while it played, recorded inside the page. */
interface ReplayRecord {
  places: string[];
  sounds: string[];
}
type RecordWindow = Window & { __replayRecord: ReplayRecord };

test("walks a short visit that nobody answers, through the replay of every missed sound, to the picture", async ({
  page,
}) => {
  test.setTimeout(15 * 60_000);
  const record = await openPage(page, address);
  await enterRoom(page);

  // Nobody answers. The roll call is then not caught, and the house asks whether to try again;
  // this goes on without it. After that the one room waits for no press until its last creature
  // has gone home and the house asks whether to play the missed sounds again. A site set back
  // to one room at a time (`roomsTogetherMaxCount: 1`) rests between two rooms and waits for a
  // press there, so that press is given too wherever it is asked for.
  const replayHeading = heading(page, replayCopy.heading);
  const goOn = page.locator(".visit-rest").getByRole("button", {
    name: roomCopy.goOnButton,
    exact: true,
  });
  const goOnWithoutPractice = button(page, practiceCopy.goOnLabel);
  const startedAt = Date.now();
  await expect(async () => {
    if (await goOn.isVisible()) {
      await goOn.click();
    }
    if (await goOnWithoutPractice.isVisible()) {
      await goOnWithoutPractice.click();
    }
    await expect(replayHeading).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 12 * 60_000, intervals: [1_000] });
  const roomsTookMs = Date.now() - startedAt;

  const start = button(page, replayCopy.startButton);
  await expect(start).toBeVisible();
  // Nobody answered, so there are more missed sounds than a replay plays, and the house says so.
  const selection = page.locator(
    ".visit-sheet-replay .visit-quiet:not(.visit-status)",
  );
  await expect(selection).toBeVisible();
  await expect(button(page, replayCopy.skipButton)).toBeVisible();
  await expect(button(page, replayCopy.stopButton)).toBeVisible();
  await expect(page.locator(".visit")).not.toHaveAttribute(
    "data-replay",
    "playing",
  );
  await expectNoHorizontalScroll(page);

  // Every place and every line the replay shows is written down as it appears.
  await page.evaluate(() => {
    const kept: ReplayRecord = { places: [], sounds: [] };
    (window as unknown as RecordWindow).__replayRecord = kept;
    const note = (list: string[], selector: string): void => {
      // Words that are out of sight, such as the last room's place before the first sound, are
      // not what the page shows.
      const element = document.querySelector(selector);
      const text =
        element?.checkVisibility() === true ? (element.textContent ?? "") : "";
      if (text !== "" && list[list.length - 1] !== text) {
        list.push(text);
      }
    };
    new MutationObserver(() => {
      if (document.querySelector(".visit")?.getAttribute("data-replay")) {
        note(kept.places, ".visit-room-progress");
        note(kept.sounds, ".visit-replay-sound");
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
  });

  // A press in the instant the sheet appears is not taken as meant, so the test waits like a
  // visitor who reads the sheet first.
  const replayStartedAt = Date.now();
  await expect(async () => {
    await start.click({ timeout: 1_000 });
    await expect(page.locator(".visit")).toHaveAttribute(
      "data-replay",
      "playing",
      { timeout: 1_000 },
    );
  }).toPass({ timeout: 15_000 });
  await expect(button(page, replayCopy.skipRestButton)).toBeVisible();
  await expect(button(page, replayCopy.stopButton)).toBeVisible();
  await expectNoHorizontalScroll(page);

  // The replay ends by itself and leads to the picture.
  const seePicture = button(page, replayCopy.goOnButton);
  await expect(seePicture).toBeVisible({ timeout: 3 * 60_000 });
  const replayTookMs = Date.now() - replayStartedAt;
  await expect(replayHeading).toBeVisible();
  await expect(page.locator(".visit")).not.toHaveAttribute(
    "data-replay",
    "playing",
  );
  // What is said after the last sound speaks of the sounds as played, not as still to come.
  await expect(selection).toBeHidden();

  const shown = await page.evaluate(
    () => (window as unknown as RecordWindow).__replayRecord,
  );
  // The places count up one by one to the number of sounds the replay holds.
  const last = shown.places[shown.places.length - 1] ?? "";
  const count = Number(/(\d+)$/.exec(last)?.[1] ?? "0");
  expect(count, `the last place shown was "${last}"`).toBeGreaterThan(0);
  expect(shown.places).toHaveLength(count);
  expect(new Set(shown.places).size).toBe(count);
  expect(shown.sounds.length).toBeGreaterThanOrEqual(1);
  console.log(
    `whole visit: the rooms took ${String(Math.round(roomsTookMs / 1000))} s, ` +
      `the replay played ${String(count)} sounds in ${String(Math.round(replayTookMs / 1000))} s`,
  );
  console.log(`whole visit: places ${shown.places.join(" | ")}`);
  console.log(`whole visit: lines ${shown.sounds.join(" | ")}`);

  await expect(async () => {
    await seePicture.click({ timeout: 1_000 });
    await expect(heading(page, resultPageCopy.heading)).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 15_000 });

  expect(record, "requests to other origins and uncaught errors").toEqual({
    otherOriginRequests: [],
    pageErrors: [],
  });
});
