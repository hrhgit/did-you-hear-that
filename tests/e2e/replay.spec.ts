import { existsSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { lanternConfig } from "../../src/config/lantern-config";
import { creatureCopy, oneRoomCopy } from "../../src/copy/creature-copy";
import { leavingCopy } from "../../src/copy/leaving-copy";
import { replayCopy } from "../../src/copy/replay-copy";
import type {
  ReplaySoundStartedEvent,
  VisitSnapshot,
} from "../../src/session/visit-flow-types";
import type { ReplaySheet } from "../../src/ui/visit/start-replay-sheet";
import { devServer } from "./dev-server";
import {
  expectNoHorizontalScroll,
  expectNoSeriousAccessibilityProblem,
  openPage,
  overlappingBoxes,
  readSoundSources,
  settle,
  type Box,
} from "./page-checks";
import { simulatedReplay, type SimulatedReplay } from "./simulated-replay";

// The replay of missed sounds in a real browser. It comes after the one room of a visit, so these
// tests do not walk one: a simulated visitor walks it in Node, on the fake audio backend, and the
// development replay sheet draws each moment of the replay that the visit gave. That sheet has no
// sound at all, and the browser runs muted all the same. Nothing here checks what a sound is like.
test.use({ launchOptions: { args: ["--mute-audio"] } });

const address = `http://localhost:${String(devServer.port)}${devServer.replaySheetPath}`;

/** A visit with more missed sounds than a replay plays, so the replay is a selection. */
let replay: SimulatedReplay;
/** A visit in which every sound was answered, each time with the other side. */
let nothingMissed: SimulatedReplay;

test.beforeAll(async () => {
  // Inside the playable range: with the calibration these visits keep, every creature's search
  // floor is −35 dB (audible-start, the playable floor), and this visitor misses more than 20
  // sounds.
  replay = await simulatedReplay("quick", {
    kind: "thresholds",
    leftDb: -30,
    rightDb: -20,
  });
  nothingMissed = await simulatedReplay("quick", {
    kind: "extreme",
    name: "alwaysAnswersWrongSide",
  });
});

type SheetWindow = Window & { replaySheet: ReplaySheet };
type Side = "left" | "right";

async function show(page: Page, snapshot: VisitSnapshot): Promise<void> {
  await page.evaluate((given) => {
    (window as unknown as SheetWindow).replaySheet.show(given);
  }, snapshot);
}

async function giveEvent(
  page: Page,
  event: ReplaySoundStartedEvent,
): Promise<void> {
  await page.evaluate((given) => {
    (window as unknown as SheetWindow).replaySheet.event(given);
  }, event);
}

const requests = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as SheetWindow).replaySheet.requests);

const button = (page: Page, name: string): Locator =>
  page.getByRole("button", { name, exact: true });
const sheet = (page: Page): Locator => page.locator(".visit-sheet-replay");
const panel = (page: Page): Locator => page.locator(".visit-replay");
const stopButton = (page: Page): Locator => button(page, replayCopy.stopButton);
const doorway = (page: Page, side: Side): Locator =>
  page.locator(`.room-door-${side}`);
/**
 * The creature that stands in a doorway in plain view. One that is leaving stays in the page
 * until its place is taken again, so it is left out.
 */
const standingIn = (page: Page, side: Side): Locator =>
  doorway(page, side).locator('.room-figure:not([data-leaving="true"])');
const standingAnywhere = (page: Page): Locator =>
  page.locator('.room-figure:not([data-leaving="true"])');
const ringsOn = (page: Page, side: Side): Locator =>
  page.locator(`.room-rings-${side} .room-ring`);
const otherSide = (side: Side): Side => (side === "left" ? "right" : "left");

/** How long the first buttons of the replay ignore presses, and a little more. */
const guardMs = 800;

/** The index of the first sound of the replay on a side. */
function firstSoundOn(side: Side): number {
  const index = replay.sounds.findIndex(({ sound }) => sound.ear === side);
  if (index < 0) {
    throw new Error(`The simulated replay has no sound on the ${side}.`);
  }
  return index;
}

/** Where an element is on the page, with every shift and scale that is on it. */
async function boxOf(part: Locator, name: string): Promise<Box> {
  if ((await part.count()) !== 1) {
    throw new Error(`The page does not show exactly one ${name}.`);
  }
  return part.evaluate((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  });
}

/**
 * The boxes of everything that stands on the page while a sound plays on this side, by name: the
 * bar's words and controls, the words under the room, and the creature in its doorway.
 */
async function boxesWhilePlaying(
  page: Page,
  side: Side,
): Promise<Record<string, Box>> {
  const parts: Record<string, Locator> = {
    stop: stopButton(page),
    room: page.locator(".visit-room"),
    sound: page.locator(".visit-replay-sound"),
    leftCount: page.locator(".visit-replay-count-left"),
    rightCount: page.locator(".visit-replay-count-right"),
    note: page.locator(".visit-replay-note"),
    skip: button(page, replayCopy.skipRestButton),
    creature: standingIn(page, side),
  };
  const boxes: Record<string, Box> = {};
  for (const [name, part] of Object.entries(parts)) {
    await expect(part, `the ${name}`).toBeVisible();
    boxes[name] = await boxOf(part, name);
  }
  return boxes;
}

test.describe("the replay of missed sounds", () => {
  test("asks before any sound, and takes no press that was meant for the room", async ({
    page,
  }) => {
    const record = await openPage(page, address);
    const opening = replay.opening;
    if (opening.replay.phase !== "announcing") {
      throw new Error("The simulated visit missed nothing.");
    }
    expect(opening.replay.selectionLine).not.toBeNull();

    // The sheet appears and both of its buttons are pressed in the same instant.
    await page.evaluate((given) => {
      (window as unknown as SheetWindow).replaySheet.show(given);
      for (const pressed of document.querySelectorAll<HTMLButtonElement>(
        ".visit-sheet-replay button",
      )) {
        pressed.click();
      }
    }, opening);
    expect(await requests(page)).toEqual([]);

    // This is the first thing the development sheet shows, and a page does not move the focus
    // for its first screen. The focus of this sheet is checked where the replay ends.
    await expect(sheet(page)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: replayCopy.heading }),
    ).toBeVisible();
    const lines = sheet(page).locator(".visit-replay-lines p");
    await expect(lines).toHaveText([...opening.replay.announcementLines]);
    await expect(sheet(page)).toContainText(opening.replay.selectionLine ?? "");
    await expect(
      sheet(page).locator(".visit-replay-sheet-counts"),
    ).toBeHidden();
    await expect(stopButton(page)).toBeVisible();
    await expect(panel(page)).toBeHidden();
    // The room is only just there behind the sheet, and nobody stands in it.
    await expect(page.locator("main")).toHaveAttribute("data-house", "faint");
    await expect(standingAnywhere(page)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);

    // Once the sheet has been up for a moment, each button does its one thing.
    await page.waitForTimeout(guardMs);
    await button(page, replayCopy.startButton).click();
    await button(page, replayCopy.skipButton).click();
    await stopButton(page).click();
    expect(await requests(page)).toEqual(["startReplay", "proceed", "stop"]);

    // The page has no sound of its own: the flow alone would start one, and there is none here.
    const sources = await readSoundSources(page);
    expect(sources.counts).toEqual({ audioContexts: 0, mediaElements: 0 });
    expect(sources.mediaElementsInDocument).toBe(0);
    expect(record.pageErrors).toEqual([]);
    expect(record.otherOriginRequests).toEqual([]);
  });

  test("shows each sound in the room: its creature in the doorway of its side, its place, its words and both counts", async ({
    page,
  }) => {
    const record = await openPage(page, address);
    await show(page, replay.opening);
    if (replay.started === null) {
      throw new Error("The simulated visit missed nothing.");
    }

    // After the press and before the first sound: the room is in view and says nothing yet.
    // Nobody stands in it, its lantern simply burns, and it has no cards along its foot.
    await show(page, replay.started);
    await expect(sheet(page)).toBeHidden();
    await expect(panel(page)).toBeVisible();
    await expect(page.locator("main")).toHaveAttribute("data-house", "full");
    await expect(
      page.getByRole("img", { name: oneRoomCopy.sceneLabel }),
    ).toBeVisible();
    await expect(page.locator(".visit-replay-sound")).toHaveText("");
    await expect(page.locator(".visit-room")).toBeHidden();
    await expect(stopButton(page)).toBeVisible();
    await expect(standingAnywhere(page)).toHaveCount(0);
    await expect(page.locator(".room-ring")).toHaveCount(0);
    await expect(
      page.locator(".visit-lantern-cell[data-lit='true']"),
    ).toHaveCount(lanternConfig.cellCount);
    await expect(page.locator(".visit-lantern")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    await expect(
      page.getByRole("list", { name: oneRoomCopy.shelfLabel }),
    ).toBeHidden();

    const shown = [
      0,
      firstSoundOn("left"),
      firstSoundOn("right"),
      replay.sounds.length - 1,
    ];
    for (const [order, index] of shown.entries()) {
      const moment = replay.sounds[index];
      if (moment === undefined || moment.snapshot.replay.phase !== "playing") {
        throw new Error("The simulated replay has no such sound.");
      }
      const { sound } = moment;
      const counts = moment.snapshot.replay.counts;
      // The event and the snapshot of a sound come one after the other.
      await giveEvent(page, moment.event);
      await show(page, moment.snapshot);

      // The bar names the creature that made the sound and the sound's place in the replay.
      await expect(page.locator(".visit-room-name")).toHaveText(
        creatureCopy[sound.room.roomId].name,
      );
      await expect(page.locator(".visit-room-progress")).toHaveText(
        sound.positionLabel,
      );
      // That creature stands in the doorway of the sound's side, and rings go out from it.
      const creature = standingIn(page, sound.ear);
      await expect(creature).toHaveCount(1);
      await expect(creature).toHaveAttribute(
        "data-creature",
        sound.room.roomId,
      );
      await expect(standingIn(page, otherSide(sound.ear))).toHaveCount(0);
      await expect(standingAnywhere(page)).toHaveCount(1);
      await expect(ringsOn(page, sound.ear)).toHaveCount(3);
      if (order === 0) {
        // No sound has played on the other side yet, so no ring was ever drawn there.
        await expect(page.locator(".room-ring")).toHaveCount(3);
      }
      await expect(panel(page)).toHaveAttribute("data-side", sound.ear);
      await expect(page.locator(".visit-replay-sound")).toHaveText(
        sound.rippleLabel,
      );
      await expect(page.locator(".visit-replay-count-left")).toHaveText(
        counts?.leftLine ?? "",
      );
      await expect(page.locator(".visit-replay-count-right")).toHaveText(
        counts?.rightLine ?? "",
      );
      await expect(page.locator(".visit-replay-note")).toHaveText(
        moment.snapshot.replay.selectionLine ?? "",
      );
      await expect(stopButton(page)).toBeVisible();
      // No answer is asked for and nothing can be paused by hand.
      await expect(page.locator(".visit-answer")).toHaveCount(2);
      for (const answer of await page.locator(".visit-answer").all()) {
        await expect(answer).toBeHidden();
      }
      await settle(page);
      expect(
        overlappingBoxes(await boxesWhilePlaying(page, sound.ear)),
      ).toEqual([]);
      await expectNoHorizontalScroll(page);
    }
    await expectNoSeriousAccessibilityProblem(page);

    // The way out of the sounds takes a press at once, and so does the stop control.
    await button(page, replayCopy.skipRestButton).click();
    await stopButton(page).click();
    expect(await requests(page)).toEqual(["proceed", "stop"]);
    expect(record.pageErrors).toEqual([]);
  });

  test("keeps the words apart from one another and from the creature down to 360 by 640", async ({
    page,
  }) => {
    await openPage(page, address);
    const longest = [...replay.sounds].sort(
      (a, b) => b.sound.rippleLabel.length - a.sound.rippleLabel.length,
    )[0];
    const last = replay.sounds[replay.sounds.length - 1];
    if (longest === undefined || last === undefined) {
      throw new Error("The simulated visit missed nothing.");
    }
    for (const size of [
      { width: 360, height: 640 },
      { width: 640, height: 360 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(size);
      const sizeName = `at ${String(size.width)} by ${String(size.height)}`;
      for (const moment of [longest, last]) {
        const side = moment.sound.ear;
        await show(page, moment.snapshot);
        await settle(page);
        const boxes = await boxesWhilePlaying(page, side);
        expect(overlappingBoxes(boxes), sizeName).toEqual([]);
        await expectNoHorizontalScroll(page);

        // The strip of words is the floor of the room: it begins where the doorway ends, so the
        // words never stand on the feet of whoever is in the doorway.
        const door = await boxOf(doorway(page, side), "doorway");
        const strip = await boxOf(panel(page), "strip of words");
        expect(strip.y, sizeName).toBeGreaterThanOrEqual(
          door.y + door.height - 0.5,
        );

        // The room keeps a useful size above the words. The smallest it draws, on a phone on
        // its side, is a doorway 172 px tall and a creature 88 px wide: the bounds are a little
        // under those, so a change that squeezes the room shows here.
        const creature = boxes.creature;
        if (creature === undefined) {
          throw new Error("The page shows no creature.");
        }
        expect(door.height, sizeName).toBeGreaterThanOrEqual(160);
        expect(creature.width, sizeName).toBeGreaterThanOrEqual(80);
        expect(creature.height, sizeName).toBeGreaterThanOrEqual(80);
        // The creature is whole: inside its doorway from side to side, and inside the page.
        expect(creature.x, sizeName).toBeGreaterThanOrEqual(door.x - 0.5);
        expect(creature.x + creature.width, sizeName).toBeLessThanOrEqual(
          door.x + door.width + 0.5,
        );
        expect(creature.y, sizeName).toBeGreaterThanOrEqual(door.y - 0.5);
        expect(creature.y + creature.height, sizeName).toBeLessThanOrEqual(
          door.y + door.height + 0.5,
        );
        expect(creature.x, sizeName).toBeGreaterThanOrEqual(0);
        expect(creature.x + creature.width, sizeName).toBeLessThanOrEqual(
          size.width,
        );
      }
    }
  });

  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    const motion =
      reducedMotion === "reduce" ? "with less motion" : "with every motion";
    test(`puts the creature and the rings of a sound at the doorway of the side it came from, ${motion}`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      await openPage(page, address);
      await show(page, replay.opening);
      if (replay.started === null) {
        throw new Error("The simulated visit missed nothing.");
      }
      await show(page, replay.started);
      const pageWidth = page.viewportSize()?.width ?? 0;
      expect(pageWidth).toBeGreaterThan(0);

      for (const side of ["left", "right"] as const) {
        const moment = replay.sounds[firstSoundOn(side)];
        if (moment === undefined) {
          throw new Error("The simulated replay has no such sound.");
        }
        await giveEvent(page, moment.event);
        await show(page, moment.snapshot);

        const creature = standingIn(page, side);
        await expect(creature).toHaveCount(1);
        await expect(standingIn(page, otherSide(side))).toHaveCount(0);
        // The rings can be seen as they go out. With less motion they stand still and fade.
        const firstRing = ringsOn(page, side).first();
        await expect
          .poll(
            () =>
              firstRing.evaluate((ring) =>
                Number(getComputedStyle(ring).opacity),
              ),
            { intervals: [40] },
          )
          .toBeGreaterThan(0.3);
        // Once every fade has ended the creature is there in full and the rings are gone.
        await settle(page);
        await expect(creature).toHaveCSS("opacity", "1");
        await expect(firstRing).toHaveCSS("opacity", "0");

        // The doorway of a side is on that side of the page.
        const door = await boxOf(doorway(page, side), "doorway");
        if (side === "left") {
          expect(door.x + door.width).toBeLessThan(pageWidth / 2);
        } else {
          expect(door.x).toBeGreaterThan(pageWidth / 2);
        }
        // The creature stands inside it, from one side to the other.
        const figure = await boxOf(creature, "creature");
        expect(figure.width).toBeGreaterThan(0);
        expect(figure.x).toBeGreaterThanOrEqual(door.x - 0.5);
        expect(figure.x + figure.width).toBeLessThanOrEqual(
          door.x + door.width + 0.5,
        );
        // The rings go out from the middle of that doorway, at a height inside it.
        for (const ring of await ringsOn(page, side).all()) {
          const box = await boxOf(ring, "ring");
          expect(box.width).toBeGreaterThan(0);
          const centreX = box.x + box.width / 2;
          const centreY = box.y + box.height / 2;
          expect(Math.abs(centreX - (door.x + door.width / 2))).toBeLessThan(1);
          expect(centreY).toBeGreaterThan(door.y);
          expect(centreY).toBeLessThan(door.y + door.height);
        }
      }
    });
  }

  test("covers a paused replay with the replay's own line and a way on", async ({
    page,
  }) => {
    await openPage(page, address);
    const first = replay.sounds[0];
    if (first === undefined) {
      throw new Error("The simulated visit missed nothing.");
    }
    await show(page, first.snapshot);
    await expect(standingIn(page, first.sound.ear)).toHaveCount(1);
    for (const reason of ["hidden", "interrupted"] as const) {
      await show(page, replay.paused(0, reason));
      await expect(
        page.getByRole("heading", { name: leavingCopy.pauseHeading }),
      ).toBeFocused();
      await expect(page.locator(".visit-sheet-notice")).toContainText(
        replayCopy.pauseLines[reason],
      );
      await expect(panel(page)).toBeHidden();
      // Behind the notice nobody stands in the room.
      await expect(standingAnywhere(page)).toHaveCount(0);
      await expect(stopButton(page)).toBeVisible();
      await expectNoHorizontalScroll(page);
      await button(page, replayCopy.resumeButton).click();
      // Going on brings the room, the creature of the sound and the sound's words back.
      await show(page, first.snapshot);
      await expect(panel(page)).toBeVisible();
      await expect(standingIn(page, first.sound.ear)).toHaveAttribute(
        "data-creature",
        first.sound.room.roomId,
      );
    }
    await expectNoSeriousAccessibilityProblem(page);
    expect(await requests(page)).toEqual(["resume", "resume"]);
  });

  test("ends with what was played, both counts and the way to the picture", async ({
    page,
  }) => {
    await openPage(page, address);
    const last = replay.sounds[replay.sounds.length - 1];
    const finished = replay.finished;
    if (
      last === undefined ||
      finished === null ||
      finished.replay.phase !== "finished"
    ) {
      throw new Error("The simulated visit missed nothing.");
    }
    await show(page, last.snapshot);
    await expect(standingAnywhere(page)).toHaveCount(1);
    await show(page, finished);
    await expect(sheet(page)).toBeVisible();
    await expect(panel(page)).toBeHidden();
    await expect(
      page.getByRole("heading", { name: replayCopy.heading }),
    ).toBeFocused();
    await expect(sheet(page).locator(".visit-replay-lines p")).toHaveText([
      finished.replay.endLine,
    ]);
    const counts = sheet(page).locator(".visit-replay-sheet-counts p");
    await expect(counts).toHaveText([
      finished.replay.counts.leftLine,
      finished.replay.counts.rightLine,
    ]);
    await expect(button(page, replayCopy.startButton)).toBeHidden();
    await expect(stopButton(page)).toBeVisible();
    // The last creature has left the room, which is only just there behind the sheet.
    await expect(page.locator("main")).toHaveAttribute("data-house", "faint");
    await expect(standingAnywhere(page)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);

    await page.waitForTimeout(guardMs);
    await button(page, replayCopy.goOnButton).click();
    expect(await requests(page)).toEqual(["proceed"]);
  });

  test("says so when no sound was missed, and leads to the picture", async ({
    page,
  }) => {
    await openPage(page, address);
    const opening = nothingMissed.opening;
    if (opening.replay.phase !== "nothingMissed") {
      throw new Error("The simulated visitor missed a sound.");
    }
    await show(page, opening);
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).locator(".visit-replay-lines p")).toHaveText([
      replayCopy.nothingMissedLine,
    ]);
    await expect(
      sheet(page).locator(".visit-replay-sheet-counts p"),
    ).toHaveText([
      opening.replay.counts.leftLine,
      opening.replay.counts.rightLine,
    ]);
    await expect(button(page, replayCopy.startButton)).toBeHidden();
    await expect(button(page, replayCopy.skipButton)).toBeHidden();
    await expect(stopButton(page)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);

    await page.waitForTimeout(guardMs);
    await button(page, replayCopy.goOnButton).click();
    expect(await requests(page)).toEqual(["proceed"]);
  });

  test("is not part of the built site", () => {
    expect(existsSync("dist/replay-sheet.html")).toBe(false);
  });
});
