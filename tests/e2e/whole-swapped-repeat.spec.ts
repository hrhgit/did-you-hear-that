import { expect, test, type Page } from "@playwright/test";
import { headphoneCheckCopy } from "../../src/copy/headphone-check-copy";
import { resultPageCopy } from "../../src/copy/result-page-copy";
import { roomCopy } from "../../src/copy/room-copy";
import { rulesCopy } from "../../src/copy/rules-copy";
import { swappedRepeatCopy } from "../../src/copy/swapped-repeat-copy";
import { visitCopy } from "../../src/copy/visit-copy";
import { expectNoHorizontalScroll, openPage } from "./page-checks";
import { previewServers } from "./preview-servers";
import { button, enterHouse, heading, playCheck } from "./visit-steps";

// One whole short visit on the public page, walked by a listener that lives in the page: it reads
// each sound the page starts, its channel and its peak, and answers the way a visitor with a
// quieter left ear would. It then visits a floor again with the headphones swapped, from the
// result page, to the comparison and back. It takes minutes of real time, so it runs only when
// asked:
//
//   WHOLE_VISIT=1 npx playwright test whole-swapped-repeat --project=desktop
//
// The browser is muted. This checks that the page runs the swapped repeat from end to end with
// the real visit flow, not what anything sounds like.
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

/** What the listener in the page knows and has heard. */
interface Listener {
  /** The peak, in dB of full scale, of the hiss of the headphone check: 0 dB of the visit. */
  referenceDb: number | null;
  /** The quietest peak each ear hears, relative to the reference. */
  thresholdDb: { left: number; right: number };
  /** Whether the earpieces are on the other ears. */
  swapped: boolean;
  /** Every sound the page started: the channel that held it and its peak, in dB of full scale. */
  sounds: { channel: "left" | "right" | null; peakDb: number }[];
  /** How many key presses the listener gave. */
  answers: number;
}
type ListenerWindow = Window & { __listener: Listener };

/**
 * Runs in the page before any of its scripts. Wraps `AudioBufferSourceNode.prototype.start` so
 * that every sound is read before it plays. Once the reference is set, a sound an ear hears is
 * answered with that ear's key 400 ms after it starts. This function is serialised into the page.
 *
 * Both ears stop hearing above the quietest sound the house can play. The test keeps the lowest
 * calibration setting that can be kept, where every room's search reaches down to 30 dB below the
 * calibration (audible-start, the playable floor). An ear that still hears the sound at that floor
 * has no quietest catch to compare, and then no floor offers the repeat. With these two ears the
 * corridor and the attic end 20 dB apart, left above right.
 */
function installListener(): void {
  const listener: Listener = {
    referenceDb: null,
    thresholdDb: { left: -15, right: -35 },
    swapped: false,
    sounds: [],
    answers: 0,
  };
  Object.defineProperty(window, "__listener", { value: listener });
  const peakDb = (data: Float32Array): number => {
    let peak = 0;
    for (const sample of data) {
      peak = Math.max(peak, Math.abs(sample));
    }
    return peak === 0 ? -Infinity : 20 * Math.log10(peak);
  };
  const originalStart = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (
    this: AudioBufferSourceNode,
    when?: number,
    offset?: number,
    duration?: number,
  ): void {
    const buffer = this.buffer;
    if (buffer !== null && buffer.numberOfChannels === 2) {
      const left = peakDb(buffer.getChannelData(0));
      const right = peakDb(buffer.getChannelData(1));
      const channel =
        left === -Infinity && right === -Infinity
          ? null
          : left >= right
            ? "left"
            : "right";
      const peak = Math.max(left, right);
      listener.sounds.push({ channel, peakDb: peak });
      const reference = listener.referenceDb;
      if (channel !== null && reference !== null) {
        const ear = listener.swapped
          ? channel === "left"
            ? "right"
            : "left"
          : channel;
        if (peak - reference >= listener.thresholdDb[ear]) {
          const context = this.context;
          const delayMs =
            Math.max(0, ((when ?? 0) - context.currentTime) * 1000) + 400;
          window.setTimeout(() => {
            listener.answers += 1;
            document.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: ear === "left" ? "ArrowLeft" : "ArrowRight",
                bubbles: true,
                cancelable: true,
              }),
            );
          }, delayMs);
        }
      }
    }
    originalStart.call(this, when, offset, duration);
  };
}

const listenerState = (page: Page): Promise<Listener> =>
  page.evaluate(() => (window as unknown as ListenerWindow).__listener);

/** The ear the listener heard the last sound in, as the visitor names it. */
async function lastHeardSide(page: Page): Promise<"left" | "right"> {
  const state = await listenerState(page);
  const last = state.sounds[state.sounds.length - 1];
  if (last?.channel === null || last === undefined) {
    throw new Error("The page has started no sound to answer.");
  }
  if (!state.swapped) {
    return last.channel;
  }
  return last.channel === "left" ? "right" : "left";
}

test("walks a visit with a quieter left ear, then visits a floor again with the headphones swapped", async ({
  page,
}) => {
  test.setTimeout(20 * 60_000);
  await page.addInitScript(installListener);
  const record = await openPage(page, address);
  await enterHouse(page);

  // The hiss of the check plays at 0 dB of the visit, so its peak is the listener's reference.
  await playCheck(page);
  await page.evaluate(() => {
    const listener = (window as unknown as ListenerWindow).__listener;
    const last = listener.sounds[listener.sounds.length - 1];
    listener.referenceDb = last?.peakDb ?? null;
  });
  expect((await listenerState(page)).referenceDb).not.toBeNull();
  expect(await lastHeardSide(page)).toBe("left");
  await button(page, headphoneCheckCopy.answers.left).click();
  await button(page, visitCopy.goOnButton).click();
  await button(page, rulesCopy.enterButton).click();

  // Through the one room to the picture. The listener answers the roll call
  // as it answers everything else. A site set back to one room at a time rests between two rooms
  // and waits for a press, which is given wherever it is asked for.
  const picture = heading(page, resultPageCopy.heading);
  const goOn = page.locator(".visit-rest").getByRole("button", {
    name: roomCopy.goOnButton,
    exact: true,
  });
  await expect(async () => {
    if (await goOn.isVisible()) {
      await goOn.click({ timeout: 1_000 });
    }
    await expect(picture).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 12 * 60_000, intervals: [1_000] });
  expect((await listenerState(page)).answers).toBeGreaterThan(10);

  // The left ear needs louder sounds, so at least one floor offers the repeat.
  const offers = page
    .getByRole("button", { name: resultPageCopy.swappedRepeatButton })
    .filter({ visible: true });
  await expect(offers.first()).toBeVisible();
  const offersBefore = await offers.count();
  await offers.first().click();

  // The instruction plays nothing; the listener swaps the headphones and says so.
  await expect(heading(page, swappedRepeatCopy.heading)).toBeVisible();
  const soundsBeforeSwap = (await listenerState(page)).sounds.length;
  await page.evaluate(() => {
    (window as unknown as ListenerWindow).__listener.swapped = true;
  });
  await button(page, swappedRepeatCopy.confirmButton).click();
  expect((await listenerState(page)).sounds.length).toBe(soundsBeforeSwap);

  // The check: the hiss of the left earpiece is now heard on the right.
  await expect(async () => {
    await button(page, swappedRepeatCopy.playCheckButton).click();
    await expect(button(page, swappedRepeatCopy.answers.right)).toBeEnabled({
      timeout: 400,
    });
  }).toPass({ timeout: 15_000 });
  expect(await lastHeardSide(page)).toBe("right");
  await button(page, swappedRepeatCopy.answers.right).click();
  await expect(
    page.getByText(swappedRepeatCopy.judgementLines.confirmed),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);

  // The floor's room again, answered as the one room was, to the comparison.
  await button(page, swappedRepeatCopy.startButton).click();
  const comparison = page.getByRole("heading", {
    name: swappedRepeatCopy.comparisonHeading,
  });
  await expect(comparison.first()).toBeVisible({ timeout: 6 * 60_000 });
  // The listener's left ear is the quieter one wherever the earpieces are.
  await expect(
    page.getByText(swappedRepeatCopy.outcomeLabels.followsEar).first(),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Back on the picture: the floor shows both runs, the visitor is told to turn the headphones
  // back, and the offer is gone from that floor.
  // The way back takes no press in the instant it appears, which could be meant as an answer, so
  // the test waits like a visitor who reads the comparison first.
  await expect(async () => {
    await button(page, swappedRepeatCopy.backButton).click({ timeout: 1_000 });
    await expect(picture).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  // The sheet of the repeat is out of sight now, so only the result's own words count.
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: swappedRepeatCopy.turnBackLine }),
  ).toBeVisible();
  await expect(
    page.locator(".repeat-outcome-label").filter({
      visible: true,
      hasText: swappedRepeatCopy.outcomeLabels.followsEar,
    }),
  ).toHaveCount(1);
  await expect(offers).toHaveCount(offersBefore - 1);
  await expectNoHorizontalScroll(page);
  expect(record.pageErrors).toEqual([]);
  expect(record.otherOriginRequests).toEqual([]);
});
