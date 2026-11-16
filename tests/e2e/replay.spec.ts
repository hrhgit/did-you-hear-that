import { existsSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
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
  openPage,
  readSoundSources,
} from "./page-checks";
import { simulatedReplay, type SimulatedReplay } from "./simulated-replay";

// The replay of missed sounds in a real browser. It comes after every room of a visit, so these
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
  // Inside the playable range: with the calibration these visits keep, every room's search floor
  // is −35 dB (audible-start, the playable floor), and this visitor misses more than 20 sounds.
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

/** Waits until every fade has ended. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

async function expectNoSeriousAccessibilityProblem(page: Page): Promise<void> {
  await settle(page);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(
    serious.map(
      (violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes
          .map((node) => node.target.join(" "))
          .join(", ")})`,
    ),
  ).toEqual([]);
}

const button = (page: Page, name: string): Locator =>
  page.getByRole("button", { name, exact: true });
const sheet = (page: Page): Locator => page.locator(".visit-sheet-replay");
const panel = (page: Page): Locator => page.locator(".visit-replay");
const stopButton = (page: Page): Locator => button(page, replayCopy.stopButton);

/** How long the first buttons of the replay ignore presses, and a little more. */
const guardMs = 800;

/** The index of the first sound on a side, and of the first whose level the cap changed, if any. */
function firstSoundOn(side: "left" | "right"): number {
  const index = replay.sounds.findIndex(({ sound }) => sound.ear === side);
  if (index < 0) {
    throw new Error(`The simulated replay has no sound on the ${side}.`);
  }
  return index;
}

/** The boxes of everything that stands on the page while a sound plays, by name. */
async function boxesWhilePlaying(
  page: Page,
): Promise<
  Record<string, { x: number; y: number; width: number; height: number }>
> {
  const parts: Record<string, Locator> = {
    stop: stopButton(page),
    room: page.locator(".visit-room"),
    sound: page.locator(".visit-replay-sound"),
    leftCount: page.locator(".visit-replay-count-left"),
    rightCount: page.locator(".visit-replay-count-right"),
    note: page.locator(".visit-replay-note"),
    skip: button(page, replayCopy.skipRestButton),
  };
  const boxes: Record<
    string,
    { x: number; y: number; width: number; height: number }
  > = {};
  for (const [name, part] of Object.entries(parts)) {
    const box = await part.boundingBox();
    if (box === null) {
      throw new Error(`The page does not show its ${name}.`);
    }
    boxes[name] = box;
  }
  return boxes;
}

function expectNoOverlap(
  boxes: Record<
    string,
    { x: number; y: number; width: number; height: number }
  >,
): void {
  const names = Object.keys(boxes);
  const overlapping: string[] = [];
  names.forEach((first, index) => {
    for (const second of names.slice(index + 1)) {
      const a = boxes[first];
      const b = boxes[second];
      if (a === undefined || b === undefined) {
        continue;
      }
      // Half a pixel of tolerance for boxes that share an edge.
      const apart =
        a.x + a.width <= b.x + 0.5 ||
        b.x + b.width <= a.x + 0.5 ||
        a.y + a.height <= b.y + 0.5 ||
        b.y + b.height <= a.y + 0.5;
      if (!apart) {
        overlapping.push(`${first} and ${second}`);
      }
    }
  });
  expect(overlapping).toEqual([]);
}

test.describe("the replay of missed sounds", () => {
  test("asks before any sound, and takes no press that was meant for the last room", async ({
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
    await expect(page.locator("main")).toHaveAttribute("data-house", "faint");
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

  test("shows each sound beside the house: its room lit, its place, its words and both counts", async ({
    page,
  }) => {
    const record = await openPage(page, address);
    await show(page, replay.opening);
    if (replay.started === null) {
      throw new Error("The simulated visit missed nothing.");
    }

    // After the press and before the first sound: the house is in view and says nothing yet.
    await show(page, replay.started);
    await expect(sheet(page)).toBeHidden();
    await expect(panel(page)).toBeVisible();
    await expect(page.locator("main")).toHaveAttribute("data-house", "full");
    await expect(page.locator(".visit-replay-sound")).toHaveText("");
    await expect(stopButton(page)).toBeVisible();
    await expect(page.locator(".house-room[data-state='lit']")).toHaveCount(0);

    const shown = [
      0,
      firstSoundOn("left"),
      firstSoundOn("right"),
      replay.sounds.length - 1,
    ];
    for (const index of shown) {
      const moment = replay.sounds[index];
      if (moment === undefined || moment.snapshot.replay.phase !== "playing") {
        throw new Error("The simulated replay has no such sound.");
      }
      const { sound } = moment;
      const counts = moment.snapshot.replay.counts;
      // The event and the snapshot of a sound come one after the other.
      await giveEvent(page, moment.event);
      await show(page, moment.snapshot);

      await expect(page.locator(".visit-room-name")).toHaveText(sound.roomName);
      await expect(page.locator(".visit-room-progress")).toHaveText(
        sound.positionLabel,
      );
      const lit = page.locator(".house-room[data-state='lit']");
      await expect(lit).toHaveCount(1);
      await expect(lit).toHaveAttribute("data-room", sound.room.roomId);
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
      expectNoOverlap(await boxesWhilePlaying(page));
      await expectNoHorizontalScroll(page);
    }
    await expectNoSeriousAccessibilityProblem(page);

    // The way out of the sounds takes a press at once, and so does the stop control.
    await button(page, replayCopy.skipRestButton).click();
    await stopButton(page).click();
    expect(await requests(page)).toEqual(["proceed", "stop"]);
    expect(record.pageErrors).toEqual([]);
  });

  test("keeps the words apart from one another down to 360 by 640", async ({
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
      for (const moment of [longest, last]) {
        await show(page, moment.snapshot);
        await settle(page);
        expectNoOverlap(await boxesWhilePlaying(page));
        await expectNoHorizontalScroll(page);
      }
      // The house keeps a useful size beside or above the words.
      const house = await page.locator(".visit-house").boundingBox();
      expect(house?.height ?? 0).toBeGreaterThanOrEqual(240);
    }
  });

  test("draws the ripple of a sound on the side it came from", async ({
    page,
  }) => {
    // With less motion a ripple is a still glow at the wall, which a test can look for.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPage(page, address);
    await show(page, replay.opening);

    /** How much light the canvas holds in the left and the right third of a room. */
    const lightIn = (
      roomId: string,
    ): Promise<{ left: number; right: number }> =>
      page.evaluate(async (id) => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const canvas = document.querySelector<HTMLCanvasElement>(
          ".visit-house canvas",
        );
        const room = document.querySelector(`.house-room[data-room="${id}"]`);
        const context = canvas?.getContext("2d");
        if (!canvas || !room || !context) {
          throw new Error("The page has no canvas or no such room.");
        }
        const frame = canvas.getBoundingClientRect();
        const box = room.getBoundingClientRect();
        const scale = canvas.width / frame.width;
        const third = box.width / 3;
        const sum = (fromX: number): number => {
          const data = context.getImageData(
            Math.round((fromX - frame.left) * scale),
            Math.round((box.top - frame.top) * scale),
            Math.max(1, Math.round(third * scale)),
            Math.max(1, Math.round(box.height * scale)),
          ).data;
          let total = 0;
          for (let index = 3; index < data.length; index += 4) {
            total += data[index] ?? 0;
          }
          return total;
        };
        return { left: sum(box.left), right: sum(box.right - third) };
      }, roomId);

    for (const side of ["left", "right"] as const) {
      const moment = replay.sounds[firstSoundOn(side)];
      if (moment === undefined) {
        throw new Error("The simulated replay has no such sound.");
      }
      const roomId = moment.sound.room.roomId;
      // The room is lit first, with no ripple in it, to see what the lamp alone adds.
      await show(page, moment.snapshot);
      await page.waitForTimeout(1200);
      const before = await lightIn(roomId);
      await giveEvent(page, moment.event);
      const after = await lightIn(roomId);
      const gained = {
        left: after.left - before.left,
        right: after.right - before.right,
      };
      const other = side === "left" ? "right" : "left";
      expect(gained[side], `light gained on the ${side}`).toBeGreaterThan(0);
      expect(gained[side]).toBeGreaterThan(4 * Math.max(gained[other], 0));
      // Let the glow fade before the next sound.
      await page.waitForTimeout(1500);
    }
  });

  test("covers a paused replay with the replay's own line and a way on", async ({
    page,
  }) => {
    await openPage(page, address);
    const first = replay.sounds[0];
    if (first === undefined) {
      throw new Error("The simulated visit missed nothing.");
    }
    await show(page, first.snapshot);
    for (const reason of ["hidden", "interrupted"] as const) {
      await show(page, replay.paused(0, reason));
      await expect(
        page.getByRole("heading", { name: leavingCopy.pauseHeading }),
      ).toBeFocused();
      await expect(page.locator(".visit-sheet-notice")).toContainText(
        replayCopy.pauseLines[reason],
      );
      await expect(panel(page)).toBeHidden();
      await expect(stopButton(page)).toBeVisible();
      await expectNoHorizontalScroll(page);
      await button(page, replayCopy.resumeButton).click();
      // Going on brings the house and the sound's words back.
      await show(page, first.snapshot);
      await expect(panel(page)).toBeVisible();
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
    await expect(page.locator(".house-room[data-state='lit']")).toHaveCount(0);
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
